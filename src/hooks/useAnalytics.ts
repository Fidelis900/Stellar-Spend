'use client';

import { useEffect, useCallback } from 'react';

export interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsConfig {
  enabled: boolean;
  debug?: boolean;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: typeof window !== 'undefined' && process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Client-side analytics tracking hook
 * Tracks user interactions for analytics (#398)
 */
export function useAnalytics(config: Partial<AnalyticsConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const track = useCallback(
    (event: AnalyticsEvent) => {
      if (!finalConfig.enabled) {
        if (finalConfig.debug) {
          console.log('[Analytics Debug]', event);
        }
        return;
      }

      // Send to analytics endpoint
      const payload = {
        ...event,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      // Use sendBeacon for reliability (doesn't block page unload)
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/monitoring/vitals', blob);
      } else {
        // Fallback to fetch
        fetch('/api/monitoring/vitals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch((err) => {
          if (finalConfig.debug) {
            console.error('[Analytics Error]', err);
          }
        });
      }
    },
    [finalConfig],
  );

  // Track page views
  useEffect(() => {
    track({
      category: 'Navigation',
      action: 'page_view',
      label: window.location.pathname,
    });
  }, [track]);

  // Track wallet connection
  const trackWalletConnect = useCallback(
    (walletType: string, success: boolean) => {
      track({
        category: 'Wallet',
        action: success ? 'connect_success' : 'connect_failure',
        label: walletType,
      });
    },
    [track],
  );

  // Track transaction events
  const trackTransaction = useCallback(
    (action: 'initiated' | 'completed' | 'failed', metadata?: Record<string, unknown>) => {
      track({
        category: 'Transaction',
        action,
        metadata,
      });
    },
    [track],
  );

  // Track theme changes
  const trackThemeChange = useCallback(
    (theme: string) => {
      track({
        category: 'Accessibility',
        action: 'theme_change',
        label: theme,
      });
    },
    [track],
  );

  // Track errors
  const trackError = useCallback(
    (error: Error, context?: string) => {
      track({
        category: 'Error',
        action: 'error_occurred',
        label: context,
        metadata: {
          message: error.message,
          stack: error.stack,
        },
      });
    },
    [track],
  );

  return {
    track,
    trackWalletConnect,
    trackTransaction,
    trackThemeChange,
    trackError,
  };
}
