import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import type { Cart, CartItem } from '@/types';

const DEVICE_ID_KEY = 'surat_device_id';

function generateDeviceId(): string {
  return `device_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

interface CartState {
  cart: Cart | null;
  deviceId: string;
  isLoading: boolean;
  initDeviceId: () => Promise<void>;
  loadCart: () => Promise<void>;
  addItem: (productId: number, quantity: number, note?: string, scheduledDelivery?: string) => Promise<void>;
  removeItem: (productId: number) => Promise<void>;
  updateItem: (productId: number, quantity: number, note?: string) => Promise<void>;
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  deviceId: '',
  isLoading: false,

  initDeviceId: async () => {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      set({ deviceId: stored });
    } else {
      const id = generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      set({ deviceId: id });
    }
  },

  loadCart: async () => {
    const { deviceId } = get();
    if (!deviceId) return;
    set({ isLoading: true });
    try {
      const cart = await api.cartAction({ action: 'list', device_id: deviceId });
      set({ cart, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
    }
  },

  addItem: async (productId, quantity, note, scheduledDelivery) => {
    const { deviceId } = get();
    const cart = await api.cartAction({
      action: 'add',
      product_id: productId,
      quantity,
      note,
      scheduled_delivery: scheduledDelivery,
      device_id: deviceId,
    });
    set({ cart });
  },

  removeItem: async (productId) => {
    const { deviceId } = get();
    const cart = await api.cartAction({
      action: 'remove',
      product_id: productId,
      device_id: deviceId,
    });
    set({ cart });
  },

  updateItem: async (productId, quantity, note) => {
    const { deviceId } = get();
    const cart = await api.cartAction({
      action: 'update',
      product_id: productId,
      quantity,
      note,
      device_id: deviceId,
    });
    set({ cart });
  },
}));
