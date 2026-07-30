'use client';

import { useEffect, useRef, useState } from 'react';
import { connectWebSocket } from '@/lib/polling';
import type { StatusPush } from '@/lib/polling';

export type SocketState = 'connecting' | 'connected' | 'disconnected';

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

interface UseOfframpSocketOptions {
  id: string | null;
  onStatusUpdate: (push: StatusPush) => void;
  enabled?: boolean;
}

/**
 * Connects to the offramp WebSocket for real-time status pushes.
 *
 * Automatically reconnects with exponential backoff on disconnect.
 * When isConnected is false, callers should fall back to polling hooks.
 *
 * Usage:
 *   const { isConnected } = useOfframpSocket({ id, onStatusUpdate: handlePush });
 *   // Only poll when socket is not available
 *   useEffect(() => { if (!isConnected) startPolling(); }, [isConnected]);
 */
export function useOfframpSocket({ id, onStatusUpdate, enabled = true }: UseOfframpSocketOptions): {
  socketState: SocketState;
  isConnected: boolean;
} {
  const [socketState, setSocketState] = useState<SocketState>('disconnected');

  // Keep a stable ref to the callback so the socket closure always calls the latest version.
  const callbackRef = useRef(onStatusUpdate);
  useEffect(() => {
    callbackRef.current = onStatusUpdate;
  }, [onStatusUpdate]);

  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketCleanup = useRef<(() => void) | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    if (!id || !enabled) {
      setSocketState('disconnected');
      return;
    }

    function connect() {
      if (!mounted.current || !id) return;
      setSocketState('connecting');

      const disconnect = connectWebSocket(
        id,
        (push: StatusPush) => {
          retryCount.current = 0;
          setSocketState('connected');
          callbackRef.current(push);
        },
        () => {
          if (!mounted.current) return;
          setSocketState('disconnected');
          const delay = Math.min(BASE_BACKOFF_MS * 2 ** retryCount.current, MAX_BACKOFF_MS);
          retryCount.current++;
          retryTimer.current = setTimeout(connect, delay);
        },
      );

      socketCleanup.current = disconnect;
    }

    connect();

    return () => {
      mounted.current = false;
      socketCleanup.current?.();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryCount.current = 0;
      setSocketState('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);

  return { socketState, isConnected: socketState === 'connected' };
}
