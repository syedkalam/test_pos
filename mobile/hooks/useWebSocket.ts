import { useEffect, useRef } from 'react';
import { WS_URL } from '@/constants/config';
import type { SyncEvent } from '@/types';

export function useWebSocket(onMessage: (event: SyncEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let isActive = true;
    const ws = new WebSocket(`${WS_URL}/ws`);

    ws.onopen = () => {
      if (!isActive) return;
      wsRef.current = ws;
    };

    ws.onmessage = (e) => {
      if (!isActive) return;
      const event: SyncEvent = JSON.parse(e.data);
      onMessageRef.current(event);
    };

    ws.onerror = () => {
      if (!isActive) return;
      wsRef.current = null;
    };

    return () => {
      isActive = false;
      wsRef.current = null;
      ws.close();
    };
  }, []);

  return wsRef;
}
