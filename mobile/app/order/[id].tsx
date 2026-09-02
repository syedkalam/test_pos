import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/services/api';
import type { Order } from '@/types';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const loadOrder = async () => {
    try {
      const orders = await api.getOrders();
      const found = orders.find((o) => o.id === Number(id));
      setOrder(found ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrder(); }, [id]);

  const handlePay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const result = await api.payOrder(order.id);
      Alert.alert(
        result.payment_status === 'success' ? 'Payment Successful' : 'Payment Failed',
        `Order is now: ${result.order_status}`
      );
      loadOrder();
    } catch {
      Alert.alert('Error', 'Payment request failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!order) return <Text style={styles.error}>Order not found</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order #{order.id}</Text>
      <Text style={styles.status}>Status: {order.status.toUpperCase()}</Text>
      <Text style={styles.date}>Created: {new Date(order.created_at).toLocaleString()}</Text>
      {order.status === 'draft' && (
        <TouchableOpacity style={styles.payBtn} onPress={handlePay} disabled={paying}>
          <Text style={styles.payBtnText}>{paying ? 'Processing...' : 'Pay Now'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  status: { fontSize: 18, marginBottom: 8 },
  date: { fontSize: 14, color: '#9e9e9e', marginBottom: 24 },
  payBtn: { backgroundColor: '#1976d2', padding: 16, borderRadius: 8, alignItems: 'center' },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { textAlign: 'center', marginTop: 40, fontSize: 16 },
});
