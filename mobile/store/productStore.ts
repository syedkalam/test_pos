import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import type { Category, Product, SyncEvent, SyncResponse, Tag } from '@/types';

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
}));
