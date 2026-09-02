import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useCartStore } from '@/store/cartStore';
import { CartBadge } from '@/components/CartBadge';
import { api } from '@/services/api';

export default function CartScreen() {
  const { cart, loadCart, removeItem } = useCartStore();

  useEffect(() => {
    loadCart();
  }, []);

  const handleCreateOrder = async () => {
    const deviceId = useCartStore.getState().deviceId;
    try {
      await api.createOrder(deviceId);
      Alert.alert('Order created', 'Your order is in draft. Go to Orders to pay.');
      loadCart();
    } catch {
      Alert.alert('Error', 'Could not create order.');
    }
  };

  const items = cart?.items ?? [];

  return (
    <View style={styles.container}>
      <CartBadge items={items} />
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.product?.name ?? `Product #${item.product_id}`}</Text>
              {item.note && <Text style={styles.note}>{item.note}</Text>}
              {item.scheduled_delivery && (
                <Text style={styles.delivery}>Delivery: {new Date(item.scheduled_delivery).toLocaleDateString()}</Text>
              )}
            </View>
            <Text style={styles.qty}>x{item.quantity}</Text>
            <TouchableOpacity onPress={() => removeItem(item.product_id)} style={styles.remove}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Your cart is empty</Text>}
      />
      {items.length > 0 && (
        <TouchableOpacity style={styles.orderBtn} onPress={handleCreateOrder}>
          <Text style={styles.orderBtnText}>Place Order</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 12, color: '#666', marginTop: 2 },
  delivery: { fontSize: 12, color: '#1976d2', marginTop: 2 },
  qty: { fontSize: 16, fontWeight: '700', marginHorizontal: 12 },
  remove: { padding: 8 },
  removeText: { color: '#d32f2f', fontSize: 12 },
  empty: { textAlign: 'center', color: '#9e9e9e', marginTop: 40, fontSize: 16 },
  orderBtn: { backgroundColor: '#1976d2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  orderBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
