import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import type { Product } from '@/types';

const imageCache = new Map<string, string>();

interface Props {
  product: Product;
  onPress?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
}

export function ProductCard({ product, onPress, onAddToCart }: Props) {
  const key = String(product.id);
  if (!imageCache.has(key)) {
    imageCache.set(key, `https://picsum.photos/seed/${product.id}/300/200`);
  }
  const imageUrl = imageCache.get(key)!;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress?.(product)}>
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        {product.tags && product.tags.length > 0 && (
          <View style={styles.tags}>
            {product.tags.slice(0, 3).map((tag) => (
              <Text key={tag.id} style={styles.tag}>{tag.name}</Text>
            ))}
          </View>
        )}
        <Text style={styles.version}>v{product.version}</Text>
      </View>
      {onAddToCart && (
        <TouchableOpacity style={styles.addBtn} onPress={() => onAddToCart(product)}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  image: { width: 100, height: 100 },
  info: { flex: 1, padding: 8 },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  price: { fontSize: 16, fontWeight: '700', color: '#2e7d32' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  tag: { fontSize: 10, backgroundColor: '#e3f2fd', color: '#1565c0', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginTop: 2 },
  version: { fontSize: 10, color: '#9e9e9e', marginTop: 4 },
  addBtn: { padding: 12, justifyContent: 'center', backgroundColor: '#1976d2' },
  addBtnText: { color: '#fff', fontWeight: '700' },
});
