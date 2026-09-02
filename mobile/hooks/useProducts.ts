import { useEffect } from 'react';
import { useProductStore } from '@/store/productStore';

export function useProducts() {
  const { products, isLoading, hydrated, nextCursor, initialize, loadNextPage } = useProductStore();

  useEffect(() => {
    initialize();
  }, []);

  return { products, isLoading, hydrated, nextCursor, loadNextPage };
}

export function useProductSearch() {
  const { products } = useProductStore();

  const search = async (query: string): Promise<typeof products> => {
    if (!query.trim()) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );
  };

  return { search };
}
