import { useEffect, useRef } from 'react';
import { WS_URL } from '@/constants/config';
import type { SyncEvent } from '@/types';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// `onReconnected` fires only when a connection is re-established after a
// prior disconnect (not on the initial mount connect) — callers use it to
// trigger a missed-change /sync, since messages broadcast while the socket
// was down were never delivered.
export function useWebSocket(onMessage: (event: SyncEvent) => void, onReconnected?: () => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onReconnectedRef = useRef(onReconnected);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onReconnectedRef.current = onReconnected;
  }, [onReconnected]);

  useEffect(() => {
    let isActive = true;
    let hasConnectedOnce = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      // Only one pending reconnect attempt at a time.
      if (!isActive || reconnectTimer) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!isActive) return;
      const ws = new WebSocket(`${WS_URL}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isActive) return;
        const wasReconnect = hasConnectedOnce;
        hasConnectedOnce = true;
        reconnectAttempt = 0;
        if (wasReconnect) onReconnectedRef.current?.();
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

      ws.onclose = () => {
        if (!isActive) return;
        wsRef.current = null;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      isActive = false;
      clearReconnectTimer();
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }
    };
  }, []);

  return wsRef;
}
