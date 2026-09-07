import { useEffect } from 'react';
import { useProductStore } from '@/store/productStore';

// Per-field selectors rather than destructuring the whole store: this
// component only cares about these five fields/actions, so a change to
// unrelated state (outbox, isSyncing, categories, tags, ...) must not
// trigger a re-render here.
export function useProducts() {
  const products = useProductStore((s) => s.products);
  const isLoading = useProductStore((s) => s.isLoading);
  const hydrated = useProductStore((s) => s.hydrated);
  const nextCursor = useProductStore((s) => s.nextCursor);
  const initialize = useProductStore((s) => s.initialize);
  const loadNextPage = useProductStore((s) => s.loadNextPage);

  useEffect(() => {
    initialize();
  }, []);

  return { products, isLoading, hydrated, nextCursor, loadNextPage };
}
