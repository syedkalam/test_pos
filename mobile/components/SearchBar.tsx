import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '@/services/api';
import type { Product } from '@/types';

interface Props {
  onResults: (products: Product[]) => void;
}

const DEBOUNCE_MS = 300;

export function SearchBar({ onResults }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Bumped on every new query so a slow/out-of-order response from an
  // earlier keystroke can't overwrite the results of a newer one, even if it
  // resolves after the newer request already completed.
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = async (text: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setSearching(true);
    try {
      const results = await api.searchProducts(text, controller.signal);
      if (requestId !== requestIdRef.current) return; // superseded by a newer query
      onResults(results);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      if (requestId === requestIdRef.current) onResults([]);
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  };

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      abortRef.current?.abort();
      requestIdRef.current += 1; // invalidate any in-flight/pending request
      setSearching(false);
      onResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
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
