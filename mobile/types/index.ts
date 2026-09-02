export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  version: number;
  updated_at: string;
  children?: Category[];
}

export interface Tag {
  id: number;
  name: string;
  version: number;
  updated_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number;
  version: number;
  cursor: string;
  updated_at: string;
  tags?: Tag[];
  category?: Category;
}

export interface CartItem {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
  note?: string;
  scheduled_delivery?: string;
  product?: Product;
}

export interface Cart {
  id: number;
  device_id: string;
  created_at: string;
  items?: CartItem[];
}

export interface Order {
  id: number;
  cart_id: number;
  status: 'draft' | 'paid' | 'failed';
  created_at: string;
}

export interface Payment {
  id: number;
  order_id: number;
  status: 'success' | 'failed';
  created_at: string;
}

export interface SyncEvent {
  type: 'product_bump' | 'category_bump' | 'tag_bump' | 'order_update';
  entity_id: number;
  version: number;
  updated_at: string;
}

export interface ProductsResponse {
  data: Product[];
  next_cursor: string | null;
  total_count: number;
}

export interface SyncResponse {
  products: SyncEvent[];
  categories: SyncEvent[];
  tags: SyncEvent[];
}
