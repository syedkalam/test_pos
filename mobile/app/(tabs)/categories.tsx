import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { CategoryTree } from '@/components/CategoryTree';
import { useProductStore } from '@/store/productStore';

export default function CategoriesScreen() {
  const { categories, loadCategories } = useProductStore();
  const [selectedId, setSelectedId] = useState<number | undefined>();

  useEffect(() => {
    if (categories.length === 0) loadCategories();
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
