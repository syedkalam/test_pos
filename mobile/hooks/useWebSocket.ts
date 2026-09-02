import { useEffect, useRef } from 'react';
import { WS_URL } from '@/constants/config';
import type { SyncEvent } from '@/types';

export function useWebSocket(onMessage: (event: SyncEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws`);

    ws.onopen = () => {
      wsRef.current = ws;
    };

    ws.onmessage = (e) => {
      const event: SyncEvent = JSON.parse(e.data);
      onMessage(event);
    };

    ws.onerror = () => {
      wsRef.current = null;
    };
  }, []);

  return wsRef;
}
