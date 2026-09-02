import { API_URL, PAGE_SIZE } from '@/constants/config';
import type { Cart, Category, Order, Product, ProductsResponse, SyncResponse, Tag } from '@/types';

// Thrown by the bump endpoints on HTTP 409 so callers can distinguish a
// version conflict (recoverable by retrying with the server's current
// version) from a generic/network failure (offline, 5xx, etc). Carries the
// backend's `current_version` so the caller never has to re-fetch it.
export class VersionConflictError extends Error {
  currentVersion: number;

  constructor(currentVersion: number) {
    super('version_conflict');
    this.name = 'VersionConflictError';
    this.currentVersion = currentVersion;
  }
}

// Backend bump handlers return `{error: "version_conflict", current_version}`
// on 409 (see backend/internal/handlers/{products,categories,tags}.go) — read
// it defensively so a malformed/empty body still yields a usable error.
async function readCurrentVersion(res: Response): Promise<number> {
  try {
    const body = await res.json();
    return typeof body?.current_version === 'number' ? body.current_version : -1;
  } catch {
    return -1;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getProducts(cursor?: string, limit = PAGE_SIZE): Promise<ProductsResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('after', cursor);
    const res = await fetch(`${this.baseUrl}/products?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getProduct(id: number): Promise<Product> {
    const res = await fetch(`${this.baseUrl}/products/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async searchProducts(query: string): Promise<Product[]> {
    const res = await fetch(`${this.baseUrl}/products?search=${encodeURIComponent(query)}&limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().then((r: ProductsResponse) => r.data);
  }

  async bumpProduct(id: number, expectedVersion: number): Promise<{ id: number; version: number }> {
    const res = await fetch(`${this.baseUrl}/products/${id}/bump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_version: expectedVersion }),
    });
    if (res.status === 409) throw new VersionConflictError(await readCurrentVersion(res));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getCategories(): Promise<Category[]> {
    const res = await fetch(`${this.baseUrl}/categories`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async bumpCategory(id: number, expectedVersion: number): Promise<{ id: number; version: number }> {
    const res = await fetch(`${this.baseUrl}/categories/${id}/bump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_version: expectedVersion }),
    });
    if (res.status === 409) throw new VersionConflictError(await readCurrentVersion(res));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getTags(): Promise<Tag[]> {
    const res = await fetch(`${this.baseUrl}/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async bumpTag(id: number, expectedVersion: number): Promise<{ id: number; version: number }> {
    const res = await fetch(`${this.baseUrl}/tags/${id}/bump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_version: expectedVersion }),
    });
    if (res.status === 409) throw new VersionConflictError(await readCurrentVersion(res));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async cartAction(payload: {
    action: 'add' | 'remove' | 'update' | 'list';
    product_id?: number;
    quantity?: number;
    note?: string;
    scheduled_delivery?: string;
    device_id: string;
  }): Promise<Cart> {
    const res = await fetch(`${this.baseUrl}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async createOrder(deviceId: string): Promise<Order> {
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getOrders(deviceId?: string): Promise<Order[]> {
    const url = deviceId
      ? `${this.baseUrl}/orders?device_id=${deviceId}`
      : `${this.baseUrl}/orders`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async payOrder(orderId: number): Promise<{ order_id: number; payment_status: string; order_status: string }> {
    const res = await fetch(`${this.baseUrl}/orders/${orderId}/pay`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getSync(since: number): Promise<SyncResponse> {
    const res = await fetch(`${this.baseUrl}/sync?since=${since}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

export const api = new ApiClient(API_URL);

export type { Cart } from '@/types';
