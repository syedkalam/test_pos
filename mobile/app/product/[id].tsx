import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/services/api';
import { useProductStore } from '@/store/productStore';
import { useCartStore } from '@/store/cartStore';
import type { Product } from '@/types';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const bumpProduct = useProductStore((s) => s.bumpProduct);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    api.getProduct(Number(id))
      .then(setProduct)
      .catch(() => Alert.alert('Error', 'Product not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBump = () => {
    if (!product) return;
    bumpProduct(product.id, product.version);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!product) return <Text style={styles.error}>Product not found</Text>;

  return (
    <ScrollView style={styles.container}>
      <Image source={{ uri: `https://picsum.photos/seed/${product.id}/600/300` }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        <Text style={styles.desc}>{product.description}</Text>
        {product.tags && (
          <View style={styles.tags}>
            {product.tags.map((tag) => (
              <Text key={tag.id} style={styles.tag}>{tag.name}</Text>
            ))}
          </View>
        )}
        <Text style={styles.meta}>Version: {product.version}</Text>
        <Text style={styles.meta}>Updated: {new Date(product.updated_at).toLocaleString()}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.addBtn} onPress={() => addItem(product.id, 1)}>
            <Text style={styles.btnText}>Add to Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bumpBtn} onPress={handleBump}>
            <Text style={styles.btnText}>Bump Version</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  image: { width: '100%', height: 200 },
  content: { padding: 16 },
  name: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  price: { fontSize: 24, fontWeight: '700', color: '#2e7d32', marginBottom: 12 },
  desc: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  tag: { fontSize: 12, backgroundColor: '#e3f2fd', color: '#1565c0', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  meta: { fontSize: 12, color: '#9e9e9e', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  addBtn: { flex: 1, backgroundColor: '#2e7d32', padding: 14, borderRadius: 8, alignItems: 'center' },
  bumpBtn: { flex: 1, backgroundColor: '#f57c00', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { textAlign: 'center', marginTop: 40, fontSize: 16, color: '#f44336' },
});
