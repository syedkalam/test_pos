import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CartItem } from '@/types';

interface Props {
  items: CartItem[];
}

export function CartBadge({ items }: Props) {
  const total = items.reduce(
    (sum, item) => sum + (item.product?.price ?? 0) * item.quantity,
    0
  );

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{items.length} items</Text>
      <Text style={styles.total}>${total.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#1976d2', borderRadius: 8, marginBottom: 12 },
  count: { color: '#fff', fontWeight: '600' },
  total: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
