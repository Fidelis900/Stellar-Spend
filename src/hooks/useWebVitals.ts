'use client';

import { useEffect } from 'react';
import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB } from 'web-vitals';

/**
 * Reports Core Web Vitals to /api/monitoring/vitals.
 * Mount once in the root layout or a top-level client component.
 *
 * Metrics reported:
 *   CLS  – Cumulative Layout Shift
 *   FCP  – First Contentful Paint
 *   FID  – First Input Delay (legacy, replaced by INP)
 *   INP  – Interaction to Next Paint
 *   LCP  – Largest Contentful Paint
 *   TTFB – Time to First Byte
 */
export function useWebVitals(): void {
  useEffect(() => {
    function send(metric: { name: string; value: number; rating: string; id: string }): void {
      // Use sendBeacon so the report survives page unload
      const body = JSON.stringify({
        name: metric.name,
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        rating: metric.rating,
        id: metric.id,
        url: window.location.pathname,
        ts: Date.now(),
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/monitoring/vitals',
          new Blob([body], { type: 'application/json' }),
        );
      } else {
        fetch('/api/monitoring/vitals', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(() => {
          /* best-effort */
        });
      }
    }

    onCLS(send);
    onFCP(send);
    onFID(send);
    onINP(send);
    onLCP(send);
    onTTFB(send);
  }, []);
}
