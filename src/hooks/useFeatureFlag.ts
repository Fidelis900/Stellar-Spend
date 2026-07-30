'use client';

import { useState, useEffect } from 'react';
import type { FeatureFlags } from '@/lib/feature-flags';

interface UseFeatureFlagResult {
  flags: FeatureFlags | null;
  isLoading: boolean;
  isEnabled: (path: string) => boolean;
  error: Error | null;
}

export function useFeatureFlag(userId?: string): UseFeatureFlagResult {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
        const response = await fetch(`/api/admin/feature-flags${params}`);
        if (!response.ok) throw new Error('Failed to fetch feature flags');
        const data = await response.json();
        setFlags(data.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchFlags();
  }, [userId]);

  const isEnabled = (path: string): boolean => {
    if (!flags) return false;
    const parts = path.split('.');
    let current: unknown = flags;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return false;
      }
    }
    if (typeof current === 'boolean') return current;
    if (
      current &&
      typeof current === 'object' &&
      'enabled' in (current as Record<string, unknown>)
    ) {
      return Boolean((current as Record<string, unknown>).enabled);
    }
    return false;
  };

  return { flags, isLoading, isEnabled, error };
}
