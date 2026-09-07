import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { CategoryTree } from '@/components/CategoryTree';
import { useProductStore } from '@/store/productStore';

export default function CategoriesScreen() {
  const categories = useProductStore((s) => s.categories);
  const initialize = useProductStore((s) => s.initialize);
  const [selectedId, setSelectedId] = useState<number | undefined>();

  // Route through the same single entry point as the Products tab (guarded
  // by `hydrated`, so a call after the app is already initialized is a
  // no-op) instead of a standalone loadCategories() — visiting Categories
  // before Products would otherwise bypass offline cache hydration and
  // outbox replay entirely.
  useEffect(() => {
    initialize();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Categories</Text>
      <ScrollView>
        <CategoryTree
          categories={categories}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
        />
      </ScrollView>
      {selectedId != null && (
        <View style={styles.selected}>
          <Text>Selected category ID: {selectedId}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 12 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  selected: { padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8, marginTop: 8 },
});
