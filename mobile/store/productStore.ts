import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
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

interface ProductState {
  products: Product[];
  categories: Category[];
  tags: Tag[];
  isLoading: boolean;
  isSyncing: boolean;
  nextCursor: string | null;
  lastSyncVersion: number;
  error: string | null;
  loadProducts: () => Promise<void>;
  loadNextPage: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadTags: () => Promise<void>;
  bumpProduct: (id: number, expectedVersion: number) => Promise<void>;
  applySync: (response: SyncResponse) => void;
  applyEntityEvent: (event: SyncEvent) => void;
  syncSince: () => Promise<void>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  categories: [],
  tags: [],
  isLoading: false,
  isSyncing: false,
  nextCursor: null,
  lastSyncVersion: 0,
  error: null,

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
    } catch (e) {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    try {
      const categories = await api.getCategories();
      set({ categories });
      set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
    } catch (e) {
      set({ error: 'Failed to load categories' });
    }
  },

  loadTags: async () => {
    try {
      const tags = await api.getTags();
      set({ tags });
      set({ lastSyncVersion: computeSyncFloor(get().products, get().categories, get().tags) });
    } catch (e) {
      set({ error: 'Failed to load tags' });
    }
  },

  bumpProduct: async (id: number, expectedVersion: number) => {
    try {
      const result = await api.bumpProduct(id, expectedVersion);
      set((state) => ({
        products: state.products.map((p) =>
          p.id === id ? { ...p, version: result.version } : p
        ),
      }));
    } catch (e) {
      console.error('Bump failed', e);
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
        if (products !== get().products) set({ products });
        break;
      }
      case 'tag_bump': {
        const tags = patchVersioned(get().tags, event);
        if (tags !== get().tags) set({ tags });
        break;
      }
      case 'category_bump': {
        const categories = patchCategoryTree(get().categories, event);
        if (categories !== get().categories) set({ categories });
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
}));
