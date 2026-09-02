import { useEffect } from 'react';
import { useProductStore } from '@/store/productStore';

export function useProducts() {
  const {
    products,
    isLoading,
    nextCursor,
    loadProducts,
    loadNextPage,
    loadCategories,
  } = useProductStore();

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  return { products, isLoading, nextCursor, loadNextPage };
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
