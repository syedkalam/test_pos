import React, { useCallback, useState } from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ProductCard } from '@/components/ProductCard';
import { SearchBar } from '@/components/SearchBar';
import { useProducts } from '@/hooks/useProducts';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppState } from '@/hooks/useAppState';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useCartStore } from '@/store/cartStore';
import { useProductStore } from '@/store/productStore';
import type { Product, SyncEvent } from '@/types';

export default function ProductsScreen() {
  const router = useRouter();
  const { products, isLoading, hydrated, nextCursor, loadNextPage } = useProducts();
  const addItem = useCartStore((s) => s.addItem);
  const applyEntityEvent = useProductStore((s) => s.applyEntityEvent);
  const syncSince = useProductStore((s) => s.syncSince);
  const flushOutbox = useProductStore((s) => s.flushOutbox);
  const isSyncing = useProductStore((s) => s.isSyncing);
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);

  const displayProducts = searchResults ?? products;

  const handleSyncEvent = useCallback(
    (event: SyncEvent) => {
      if (
        event.type === 'product_bump' ||
        event.type === 'category_bump' ||
        event.type === 'tag_bump'
      ) {
        applyEntityEvent(event);
      } else {
        console.log('unhandled sync event', event);
      }
    },
    [applyEntityEvent]
  );

  // Missed-change reconciliation AND outbox replay share the same recovery
  // triggers: WS reconnect (messages broadcast while disconnected were never
  // delivered), app foreground (the socket may have been suspended by the
  // OS while backgrounded), and offline -> online. Each store action guards
  // itself against overlapping calls, so firing both here is safe even if
  // multiple triggers land together.
  const handleReconnect = useCallback(() => {
    syncSince();
    flushOutbox();
  }, [syncSince, flushOutbox]);

  useWebSocket(handleSyncEvent, handleReconnect);
  useAppState(handleReconnect);
  useNetworkStatus(handleReconnect);

  const handleEndReached = useCallback(() => {
    if (!searchResults) loadNextPage();
  }, [searchResults, loadNextPage]);

  const handleAddToCart = useCallback(
    (product: Product) => {
      addItem(product.id, 1);
    },
    [addItem]
  );

  return (
    <View style={styles.container}>
      <SearchBar onResults={(r) => setSearchResults(r.length > 0 ? r : null)} />
      {/* Before hydration completes we don't yet know if there's a cached
          catalog to show, so hold the spinner rather than flash an empty
          list; a cache hit and the no-cache/first-install load both clear
          this the same way once there's something (or definitively nothing)
          to render. */}
      {!hydrated || (isLoading && products.length === 0) ? (
        <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
      ) : (
        <>
          {isSyncing && products.length > 0 && (
            <Text style={styles.syncBanner}>Syncing latest changes…</Text>
          )}
          <FlatList
            data={displayProducts}
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                onPress={(p) => router.push(`/product/${p.id}`)}
                onAddToCart={handleAddToCart}
              />
            )}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
            ListFooterComponent={isLoading ? <ActivityIndicator color="#1976d2" /> : null}
            // A failed background refresh (e.g. offline) never clears
            // `products`, so this only shows for a genuinely empty catalog —
            // first install with no network, not a fabricated error state.
            ListEmptyComponent={<Text style={styles.empty}>No products available. Check your connection.</Text>}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 12 },
  list: { paddingBottom: 20 },
  loader: { flex: 1 },
  syncBanner: { textAlign: 'center', color: '#1976d2', fontSize: 12, paddingVertical: 6 },
  empty: { textAlign: 'center', color: '#9e9e9e', marginTop: 40, fontSize: 16 },
});
