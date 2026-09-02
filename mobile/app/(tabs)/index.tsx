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
  const { products, isLoading, nextCursor, loadNextPage } = useProducts();
  const addItem = useCartStore((s) => s.addItem);
  const applyEntityEvent = useProductStore((s) => s.applyEntityEvent);
  const syncSince = useProductStore((s) => s.syncSince);
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

  // Missed-change reconciliation: fired on WS reconnect (messages broadcast
  // while disconnected were never delivered), app foreground (the socket
  // may have been suspended by the OS while backgrounded), and offline ->
  // online. All three funnel into the same store action, which guards
  // against overlapping /sync calls if they fire together.
  useWebSocket(handleSyncEvent, syncSince);

  const handleForeground = useCallback(() => {
    syncSince();
  }, [syncSince]);

  useAppState(handleForeground);
  useNetworkStatus(syncSince);

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
      {isLoading && products.length === 0 ? (
        <ActivityIndicator size="large" color="#1976d2" style={styles.loader} />
      ) : (
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
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 12 },
  list: { paddingBottom: 20 },
  loader: { flex: 1 },
});
