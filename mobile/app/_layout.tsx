import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useCartStore } from '@/store/cartStore';

export default function RootLayout() {
  const initDeviceId = useCartStore((s) => s.initDeviceId);

  useEffect(() => {
    initDeviceId();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Product Detail' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
    </Stack>
  );
}
