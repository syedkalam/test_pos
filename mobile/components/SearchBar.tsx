import React, { useState } from 'react';
import { TextInput, View, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '@/services/api';
import type { Product } from '@/types';

interface Props {
  onResults: (products: Product[]) => void;
}

export function SearchBar({ onResults }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const handleChange = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      onResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await api.searchProducts(text);
      onResults(results);
    } catch {
      onResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleChange}
        placeholder="Search products..."
        placeholderTextColor="#9e9e9e"
        returnKeyType="search"
      />
      {searching && <ActivityIndicator size="small" color="#1976d2" style={styles.spinner} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, marginBottom: 12 },
  input: { flex: 1, height: 44, fontSize: 14, color: '#333' },
  spinner: { marginLeft: 8 },
});
