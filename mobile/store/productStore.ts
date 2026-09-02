import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, VersionConflictError } from '@/services/api';
import type { Category, Product, SyncEvent, SyncResponse, Tag } from '@/types';

interface VersionedEntity {
  id: number;
  version: number;
  updated_at: string;
}

// A bump only ever changes `version`/`updated_at` server-side (see
// backend products.go/categories.go/tags.go Bump handlers) and the WS/sync
// event carries exactly that pair, so patching those two fields in place is
// a complete, correct application of the event — no refetch of the entity
// is needed. `event.version > item.version` guards against an out-of-order
// or duplicate event undoing a newer local state.
function patchVersioned<T extends VersionedEntity>(list: T[], event: SyncEvent): T[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.id !== event.entity_id || event.version <= item.version) return item;
    changed = true;
    return { ...item, version: event.version, updated_at: event.updated_at };
  });
  return changed ? next : list;
}

// Categories are a tree (list of roots with nested `children`), so matching
// by id requires a recursive walk rather than a flat map.
function patchCategoryTree(categories: Category[], event: SyncEvent): Category[] {
  let changed = false;
  const next = categories.map((cat) => {
    if (cat.id === event.entity_id) {
      if (event.version <= cat.version) return cat;
      changed = true;
      return { ...cat, version: event.version, updated_at: event.updated_at };
    }
    if (cat.children && cat.children.length > 0) {
      const patchedChildren = patchCategoryTree(cat.children, event);
      if (patchedChildren !== cat.children) {
        changed = true;
        return { ...cat, children: patchedChildren };
      }
    }
    return cat;
  });
  return changed ? next : categories;
}

// `version` is a per-entity optimistic-concurrency counter (DEFAULT 1 in the
// DB schema), not a shared/global sequence — every row starts independently
// at 1 and only advances via its own bumps. `GET /sync?since=` compares this
// single scalar directly against each table's `version` column
// (`WHERE version > ?`), using the SAME `since` for products/categories/tags.
// That makes `since` a "floor": the query is only guaranteed complete (no
// missed changes) for a table if `since` is <= the lowest version currently
// known locally in that table. Concretely: if a /sync response contains
// product A at v5 and product B at v3, setting since = max(5, 3) = 5 is
// UNSAFE — if B is later bumped in isolation to v4, the next
// `/sync?since=5` query evaluates `4 > 5 = false` and silently drops B's
// change forever. Setting since = min(...) instead (here, 3) is always safe:
// it can only make the next response broader (re-includes entities already
// known, which the version guard below no-ops), never narrower than what's
// needed to cover every locally-held entity.
function computeSyncFloor(products: Product[], categories: Category[], tags: Tag[]): number {
  let min = Infinity;
  for (const p of products) if (p.version < min) min = p.version;
  for (const t of tags) if (t.version < min) min = t.version;
  const walk = (cats: Category[]) => {
    for (const c of cats) {
      if (c.version < min) min = c.version;
      if (c.children && c.children.length > 0) walk(c.children);
    }
  };
  walk(categories);
  return min === Infinity ? 0 : min;
}

// --- Offline catalog cache (AsyncStorage) ---
// Persists exactly the entity arrays needed to redraw the last known catalog
// and to recompute a safe sync floor on next launch (see computeSyncFloor
// above) — nothing else. `lastSyncVersion` itself is intentionally NOT
// persisted; it's cheap to recompute from the cached entities via
// computeSyncFloor, which avoids a second on-disk source of truth for the
// cursor that could drift from the entities it's supposed to describe.
const CATALOG_CACHE_KEY = 'surat_catalog_cache_v1';
const PERSIST_DEBOUNCE_MS = 1500;

interface CachedCatalog {
  products: Product[];
  categories: Category[];
  tags: Tag[];
}

async function readCachedCatalog(): Promise<CachedCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.products) || !Array.isArray(parsed?.categories) || !Array.isArray(parsed?.tags)) {
      return null;
    }
    return parsed as CachedCatalog;
  } catch {
    // Corrupt/unreadable cache is treated the same as no cache — the
    // first-install (full load) path below handles it cleanly.
    return null;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

// A single WS bump, or a burst of them, patches the in-memory arrays one
// entity at a time. Writing the full ~5k-product payload to AsyncStorage on
// every individual bump would be excessive I/O for a POS device. Debouncing
// collapses a burst into a single write of the latest state a short while
// after the last change. Trade-off: if the app is killed inside the debounce
// window, the last update(s) may not have reached disk — acceptable here
// because they were never lost from the *server's* point of view, and
// syncSince() (see below) safely re-fetches anything the cache missed on the
// next launch or reconnect, using the same conservative floor.
function schedulePersist(products: Product[], categories: Category[], tags: Tag[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ products, categories, tags })).catch(() => {});
  }, PERSIST_DEBOUNCE_MS);
}

// Used after a deliberate full/paginated load (not a bursty WS patch) —
// these are infrequent enough that writing immediately is fine, and doing so
// keeps the cache from lagging behind an explicit user-visible refresh.
function persistNow(products: Product[], categories: Category[], tags: Tag[]) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ products, categories, tags })).catch(() => {});
}

// --- Offline bump outbox (AsyncStorage) ---
// A bump is a single logical operation ("advance this entity's version by
// one from what I last saw"), not a value to set — that's what makes
// server-authoritative replay safe: on a 409 we simply adopt the server's
// current_version and resend the SAME operation with that as the new
// expected_version, and success always means "one bump landed."
type EntityType = 'product' | 'category' | 'tag';

interface OutboxOp {
  opId: string;
  entityType: EntityType;
  entityId: number;
  expectedVersion: number;
  createdAt: string;
}

const OUTBOX_KEY = 'surat_outbox_v1';
const MAX_CONFLICT_RETRIES = 5;

async function readOutbox(): Promise<OutboxOp[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The outbox is tiny (a handful of pending ops at most) and durability of
// user intent matters more than write frequency here, unlike the catalog
// cache — so every mutation is persisted immediately, no debounce.
function persistOutboxNow(outbox: OutboxOp[]) {
  AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)).catch(() => {});
}

function addOutboxOp(outbox: OutboxOp[], op: OutboxOp): OutboxOp[] {
  return [...outbox, op];
}

function removeOutboxOp(outbox: OutboxOp[], opId: string): OutboxOp[] {
  return outbox.filter((o) => o.opId !== opId);
}

function updateOutboxOpVersion(outbox: OutboxOp[], opId: string, expectedVersion: number): OutboxOp[] {
  return outbox.map((o) => (o.opId === opId ? { ...o, expectedVersion } : o));
}

// After an op for (entityType, entityId) resolves to `version`, the NEXT
// still-queued op for the SAME entity (if any) was chained off the
// pre-conflict local state and may now be stale — e.g. two offline bumps
// queued expecting v4 then v5, but the first actually resolved to v7 after a
// conflict retry. Rebasing the next op's expectedVersion onto the just-
// resolved version keeps a multi-bump chain for one entity deterministic no
// matter how many conflicts happened along the way.
function rebaseNextOpForEntity(outbox: OutboxOp[], entityType: EntityType, entityId: number, version: number): OutboxOp[] {
  const idx = outbox.findIndex((o) => o.entityType === entityType && o.entityId === entityId);
  if (idx === -1 || outbox[idx].expectedVersion === version) return outbox;
  const next = outbox.slice();
  next[idx] = { ...next[idx], expectedVersion: version };
  return next;
}

function findEntityVersion(
  state: { products: Product[]; categories: Category[]; tags: Tag[] },
  entityType: EntityType,
  id: number
): number | undefined {
  if (entityType === 'product') return state.products.find((p) => p.id === id)?.version;
  if (entityType === 'tag') return state.tags.find((t) => t.id === id)?.version;
  const find = (cats: Category[]): Category | undefined => {
    for (const c of cats) {
      if (c.id === id) return c;
      if (c.children && c.children.length > 0) {
        const found = find(c.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  return find(state.categories)?.version;
}

// Sets an entity's version directly (an exact value, not a +1 patch) — used
// both to apply an optimistic bump and to reconcile a server-confirmed
// result. Guarded the same way as the WS/sync patch functions above: never
// downgrades, so a slower-resolving bump can't stomp a version a WS event or
// another resolution already advanced past it.
function withEntityVersion(
  state: { products: Product[]; categories: Category[]; tags: Tag[] },
  entityType: EntityType,
  id: number,
  version: number
): Partial<Pick<ProductState, 'products' | 'categories' | 'tags'>> {
  if (entityType === 'product') {
    const current = state.products.find((p) => p.id === id);
    if (!current || version <= current.version) return {};
    return { products: state.products.map((p) => (p.id === id ? { ...p, version } : p)) };
  }
  if (entityType === 'tag') {
    const current = state.tags.find((t) => t.id === id);
    if (!current || version <= current.version) return {};
    return { tags: state.tags.map((t) => (t.id === id ? { ...t, version } : t)) };
  }
  const patch = (cats: Category[]): { next: Category[]; changed: boolean } => {
    let changed = false;
    const next = cats.map((c) => {
      if (c.id === id) {
        if (version <= c.version) return c;
        changed = true;
        return { ...c, version };
      }
      if (c.children && c.children.length > 0) {
        const child = patch(c.children);
        if (child.changed) {
          changed = true;
          return { ...c, children: child.next };
        }
      }
      return c;
    });
    return { next, changed };
  };
  const result = patch(state.categories);
  return result.changed ? { categories: result.next } : {};
}

function bumpApiFor(entityType: EntityType) {
  if (entityType === 'product') return api.bumpProduct.bind(api);
  if (entityType === 'category') return api.bumpCategory.bind(api);
  return api.bumpTag.bind(api);
}

type BumpAttemptOutcome =
  | { status: 'success'; version: number }
  | { status: 'conflict'; currentVersion: number }
  | { status: 'network_error' };

async function attemptBump(entityType: EntityType, id: number, expectedVersion: number): Promise<BumpAttemptOutcome> {
  try {
    const result = await bumpApiFor(entityType)(id, expectedVersion);
    return { status: 'success', version: result.version };
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return { status: 'conflict', currentVersion: e.currentVersion };
    }
    // Any other failure (offline, timeout, 5xx) is treated as "request
    // cannot complete" — the caller queues it rather than discarding it, per
    // the requirement not to silently drop the user's intended bump.
    return { status: 'network_error' };
  }
}

type ResolveOutcome =
  | { status: 'success'; version: number }
  | { status: 'network_error' }
  | { status: 'gave_up'; currentVersion: number };

// Server-authoritative + operation replay: a 409 means the server's version
// is the truth, not ours, so we adopt current_version and retry the SAME
// bump against it rather than abandoning it. Bounded so a pathological
// back-to-back conflict storm can't loop forever inline; a `gave_up` result
// still carries the last known server version so the caller can queue the
// operation for the next reconnect instead of losing it.
async function resolveBumpWithRetry(entityType: EntityType, id: number, expectedVersion: number): Promise<ResolveOutcome> {
  let expected = expectedVersion;
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const outcome = await attemptBump(entityType, id, expected);
    if (outcome.status === 'success') return outcome;
    if (outcome.status === 'network_error') return outcome;
    expected = outcome.currentVersion;
  }
  return { status: 'gave_up', currentVersion: expected };
}

function makeOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface ProductState {
  products: Product[];
  categories: Category[];
  tags: Tag[];
  isLoading: boolean;
  isSyncing: boolean;
  hydrated: boolean;
  nextCursor: string | null;
  lastSyncVersion: number;
  error: string | null;
  outbox: OutboxOp[];
  isFlushingOutbox: boolean;
  initialize: () => Promise<void>;
  loadProducts: () => Promise<void>;
  loadNextPage: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadTags: () => Promise<void>;
  bumpProduct: (id: number) => Promise<void>;
  bumpCategory: (id: number) => Promise<void>;
  bumpTag: (id: number) => Promise<void>;
  flushOutbox: () => Promise<void>;
  applySync: (response: SyncResponse) => void;
  applyEntityEvent: (event: SyncEvent) => void;
  syncSince: () => Promise<void>;
}

export const useProductStore = create<ProductState>((set, get) => {
  // Shared by bumpProduct/bumpCategory/bumpTag: applies the optimistic
  // local increment immediately (responsive UI, offline or not), then tries
  // the server. A network failure queues the op for later replay; a
  // conflict is resolved inline via resolveBumpWithRetry (server-
  // authoritative + retry) since the device is clearly online right now.
  const performBump = async (entityType: EntityType, id: number) => {
    const expectedVersion = findEntityVersion(get(), entityType, id);
    if (expectedVersion === undefined) return;
    const optimisticVersion = expectedVersion + 1;

    set(withEntityVersion(get(), entityType, id, optimisticVersion));
    schedulePersist(get().products, get().categories, get().tags);

    const outcome = await resolveBumpWithRetry(entityType, id, expectedVersion);

    if (outcome.status === 'success') {
      set(withEntityVersion(get(), entityType, id, outcome.version));
      schedulePersist(get().products, get().categories, get().tags);
      return;
    }

    if (outcome.status === 'network_error') {
      const op: OutboxOp = {
        opId: makeOpId(),
        entityType,
        entityId: id,
        expectedVersion,
        createdAt: new Date().toISOString(),
      };
      set({ outbox: addOutboxOp(get().outbox, op) });
      persistOutboxNow(get().outbox);
      return;
    }

    // gave_up: repeated live conflicts (rare). Still preserve the user's
    // intended bump — rebase it onto the last known server version and let
    // the normal reconnect/replay path finish it, rather than discarding it.
    set(withEntityVersion(get(), entityType, id, outcome.currentVersion + 1));
    const op: OutboxOp = {
      opId: makeOpId(),
      entityType,
      entityId: id,
      expectedVersion: outcome.currentVersion,
      createdAt: new Date().toISOString(),
    };
    set({ outbox: addOutboxOp(get().outbox, op) });
    persistOutboxNow(get().outbox);
  };

  return {
  products: [],
  categories: [],
  tags: [],
  isLoading: false,
  isSyncing: false,
  hydrated: false,
  nextCursor: null,
  lastSyncVersion: 0,
  error: null,
  outbox: [],
  isFlushingOutbox: false,

  // Single startup entry point: check for a cached catalog before making any
  // network call. A cache hit renders immediately and only needs a delta
  // catch-up (syncSince, reused as-is from Task 3 — no separate refresh
  // path); a cache miss (first install, or a corrupt/empty cache) has no
  // usable local baseline, so it falls back to the full paginated load.
  initialize: async () => {
    if (get().hydrated) return;
    const [cached, storedOutbox] = await Promise.all([readCachedCatalog(), readOutbox()]);
    if (storedOutbox.length > 0) set({ outbox: storedOutbox });

    // Guard against a race with live data: if products/categories/tags are
    // no longer empty (e.g. a WS event or another load already landed while
    // this AsyncStorage read was in flight), the cache is stale by
    // definition — never let it overwrite newer in-memory state.
    const isPristine =
      get().products.length === 0 && get().categories.length === 0 && get().tags.length === 0;

    if (cached && cached.products.length > 0 && isPristine) {
      set({
        products: cached.products,
        categories: cached.categories,
        tags: cached.tags,
        lastSyncVersion: computeSyncFloor(cached.products, cached.categories, cached.tags),
        hydrated: true,
      });
      get().syncSince();
    } else {
      set({ hydrated: true });
      await Promise.all([get().loadProducts(), get().loadCategories(), get().loadTags()]);
    }

    // Replay any bump(s) queued before this launch (e.g. the app was killed
    // while offline with a pending outbox item). Same flush path used for a
    // live reconnect — a no-op if the outbox is empty, and it stops cleanly
    // without losing anything if the device is still offline.
    get().flushOutbox();
  },

  loadProducts: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getProducts();
      set({
        products: response.data,
        nextCursor: response.next_cursor,
        isLoading: false,
      });
      set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
      persistNow(get().products, get().categories, get().tags);
    } catch (e) {
      set({ isLoading: false, error: 'Failed to load products' });
    }
  },

  loadNextPage: async () => {
    const { nextCursor, products, isLoading } = get();
    if (!nextCursor || isLoading) return;
    set({ isLoading: true });
    try {
      const response = await api.getProducts(nextCursor);
      set({
        products: [...products, ...response.data],
        nextCursor: response.next_cursor,
        isLoading: false,
      });
      set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
      persistNow(get().products, get().categories, get().tags);
    } catch (e) {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    try {
      const categories = await api.getCategories();
      set({ categories });
      set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
      persistNow(get().products, get().categories, get().tags);
    } catch (e) {
      set({ error: 'Failed to load categories' });
    }
  },

  loadTags: async () => {
    try {
      const tags = await api.getTags();
      set({ tags });
      set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
      persistNow(get().products, get().categories, get().tags);
    } catch (e) {
      set({ error: 'Failed to load tags' });
    }
  },

  bumpProduct: (id: number) => performBump('product', id),
  bumpCategory: (id: number) => performBump('category', id),
  bumpTag: (id: number) => performBump('tag', id),

  // Drains the outbox strictly in FIFO order, one operation at a time (never
  // concurrently — see isFlushingOutbox guard) so a multi-bump chain for the
  // same entity replays deterministically. Stops (without dropping anything)
  // on the first network failure, since that means we're offline again and
  // the remaining ops simply wait for the next reconnect signal.
  flushOutbox: async () => {
    if (get().isFlushingOutbox || get().outbox.length === 0) return;
    set({ isFlushingOutbox: true });
    try {
      while (get().outbox.length > 0) {
        const op = get().outbox[0];
        const outcome = await resolveBumpWithRetry(op.entityType, op.entityId, op.expectedVersion);

        if (outcome.status === 'network_error') break;

        if (outcome.status === 'gave_up') {
          // Rebase this op onto the last known server version and try again
          // on the next reconnect rather than looping forever right now.
          set({ outbox: updateOutboxOpVersion(get().outbox, op.opId, outcome.currentVersion) });
          persistOutboxNow(get().outbox);
          break;
        }

        // success: reconcile the entity to the confirmed version, drop this
        // op, and rebase any later queued op for the same entity onto it.
        set(withEntityVersion(get(), op.entityType, op.entityId, outcome.version));
        set({
          outbox: rebaseNextOpForEntity(
            removeOutboxOp(get().outbox, op.opId),
            op.entityType,
            op.entityId,
            outcome.version
          ),
        });
        schedulePersist(get().products, get().categories, get().tags);
        persistOutboxNow(get().outbox);
      }
    } finally {
      set({ isFlushingOutbox: false });
    }
  },

  // Applies an already-fetched /sync response: patches every changed entity
  // via the same applyEntityEvent used for WS events (single merge code
  // path, so a v6 arriving over /sync is guarded against downgrading a v7
  // already applied from WS, and vice versa), then recomputes the cursor
  // floor from the now-reconciled local state. Recomputing (rather than
  // trusting response.version values directly) is what makes it safe to
  // advance the floor here: after this call, every locally-held entity is
  // known to match backend truth as of the query, so min(local versions) is
  // a provably safe next `since`.
  applySync: (response: SyncResponse) => {
    const allEvents: SyncEvent[] = [
      ...response.products,
      ...response.categories,
      ...response.tags,
    ];
    for (const event of allEvents) {
      get().applyEntityEvent(event);
    }
    set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
  },

  // A single WS event only describes ONE entity — it says nothing about
  // whether other locally-held entities have also changed, so it must never
  // move the sync cursor (see computeSyncFloor comment above for the
  // concrete missed-update scenario this avoids). The cursor only ever
  // advances from a complete source of truth: a fresh load or a full /sync
  // reconciliation (applySync).
  applyEntityEvent: (event: SyncEvent) => {
    switch (event.type) {
      case 'product_bump': {
        const products = patchVersioned(get().products, event);
        if (products !== get().products) {
          set({ products });
          schedulePersist(get().products, get().categories, get().tags);
        }
        break;
      }
      case 'tag_bump': {
        const tags = patchVersioned(get().tags, event);
        if (tags !== get().tags) {
          set({ tags });
          schedulePersist(get().products, get().categories, get().tags);
        }
        break;
      }
      case 'category_bump': {
        const categories = patchCategoryTree(get().categories, event);
        if (categories !== get().categories) {
          set({ categories });
          schedulePersist(get().products, get().categories, get().tags);
        }
        break;
      }
      default:
        break;
    }
  },

  // Fetches the missed-change delta and applies it. Guarded by `isSyncing`
  // so concurrent triggers (WS reconnect + app foreground + NetInfo
  // online firing together) collapse into a single in-flight request
  // instead of racing duplicate /sync calls — any trigger that arrives
  // while one is in flight is redundant, since the in-flight call already
  // covers the same `since` floor and will bring local state fully current
  // when it resolves.
  syncSince: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });
    try {
      const response = await api.getSync(get().lastSyncVersion);
      get().applySync(response);
    } catch (e) {
      // Leave lastSyncVersion untouched on failure so the next trigger
      // retries from the same safe floor instead of skipping ahead.
    } finally {
      set({ isSyncing: false });
    }
  },
  };
});
