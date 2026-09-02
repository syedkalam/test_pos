import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Category } from '@/types';

interface Props {
  categories: Category[];
  selectedId?: number;
  onSelect: (id: number) => void;
  depth?: number;
}

export function CategoryTree({ categories, selectedId, onSelect, depth = 0 }: Props) {
  return (
    <View style={{ paddingLeft: depth * 16 }}>
      {categories.map((cat) => (
        <View key={cat.id}>
          <TouchableOpacity
            style={[styles.item, selectedId === cat.id && styles.selected]}
            onPress={() => onSelect(cat.id)}
          >
            <Text style={[styles.label, { fontSize: 14 - depth }]}>{cat.name}</Text>
          </TouchableOpacity>
          {cat.children && cat.children.length > 0 && (
            <CategoryTree
              categories={cat.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  selected: { backgroundColor: '#e3f2fd' },
  label: { color: '#333' },
});
