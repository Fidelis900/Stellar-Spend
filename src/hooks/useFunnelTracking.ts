'use client';

import { useCallback, useRef } from 'react';
import type { FunnelStep } from '@/lib/funnel';

const STORAGE_KEY = 'funnel_session';

interface FunnelSession {
  sessionId: string;
  startedAt: number;
  steps: { step: FunnelStep; ts: number }[];
}

function getSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Tracks user progress through the offramp conversion funnel (#399).
 *
 * Each call to `trackStep` records the step locally and sends it to the
 * analytics endpoint. A new session is started on the first step of a
 * new funnel run (wallet_connect).
 */
export function useFunnelTracking() {
  const sessionRef = useRef<FunnelSession | null>(null);

  const getOrCreateSession = useCallback((step: FunnelStep): FunnelSession => {
    if (step === 'wallet_connect' || !sessionRef.current) {
      const session: FunnelSession = {
        sessionId: getSessionId(),
        startedAt: Date.now(),
        steps: [],
      };
      sessionRef.current = session;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        // sessionStorage unavailable (SSR / private mode)
      }
      return session;
    }
    return sessionRef.current;
  }, []);

  const trackStep = useCallback(
    (step: FunnelStep, metadata?: Record<string, unknown>) => {
      const session = getOrCreateSession(step);
      const entry = { step, ts: Date.now() };
      session.steps.push(entry);

      const payload = {
        category: 'Funnel',
        action: step,
        sessionId: session.sessionId,
        metadata,
        timestamp: new Date(entry.ts).toISOString(),
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('[Funnel]', payload);
      }

      // Fire-and-forget to the analytics endpoint
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/monitoring/vitals',
          new Blob([JSON.stringify(payload)], { type: 'application/json' }),
        );
      } else {
        fetch('/api/monitoring/vitals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    },
    [getOrCreateSession],
  );

  return { trackStep };
}
