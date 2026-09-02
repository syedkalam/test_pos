import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

// Fires `onOnline` only on a genuine offline -> online transition, never on
// the initial (possibly still-resolving) state NetInfo reports at mount.
export function useNetworkStatus(onOnline: () => void) {
  const onOnlineRef = useRef(onOnline);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    onOnlineRef.current = onOnline;
  }, [onOnline]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null while still being determined;
      // treat only an explicit `false` as offline.
      const isOnline = Boolean(state.isConnected) && state.isInternetReachable !== false;

      if (!isOnline) {
        wasOfflineRef.current = true;
        return;
      }

      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        onOnlineRef.current();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
