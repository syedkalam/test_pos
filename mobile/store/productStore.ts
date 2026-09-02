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

interface ProductState {
  products: Product[];
  categories: Category[];
  tags: Tag[];
  isLoading: boolean;
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
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  categories: [],
  tags: [],
  isLoading: false,
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
    } catch (e) {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    try {
      const categories = await api.getCategories();
      set({ categories });
    } catch (e) {
      set({ error: 'Failed to load categories' });
    }
  },

  loadTags: async () => {
    try {
      const tags = await api.getTags();
      set({ tags });
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

  applySync: (response: SyncResponse) => {
    const allEvents: SyncEvent[] = [
      ...response.products,
      ...response.categories,
      ...response.tags,
    ];
    const maxVersion = allEvents.reduce((max, e) => Math.max(max, e.version), get().lastSyncVersion);
    set({ lastSyncVersion: maxVersion });
  },

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

    if (event.version > get().lastSyncVersion) {
      set({ lastSyncVersion: event.version });
    }
  },
}));
