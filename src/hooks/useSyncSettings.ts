'use client';

import { useState, useCallback, useEffect } from 'react';
import { SyncStorage } from '@/lib/sync-storage';
import type { SyncSettings } from '@/lib/sync-storage';

export interface UseSyncSettingsReturn {
  settings: SyncSettings;
  loading: boolean;
  error: string | null;
  toggleSync: (enabled: boolean) => Promise<boolean>;
  syncStatus: {
    lastSyncAt: number;
    isPending: boolean;
    formattedLastSync: string;
  };
}

/**
 * Hook for managing transaction sync settings
 */
export function useSyncSettings(userAddress?: string): UseSyncSettingsReturn {
  const [settings, setSettings] = useState<SyncSettings>(SyncStorage.getDefaultSettings());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loaded = SyncStorage.getSettings();
    setSettings(loaded);
  }, []);

  const toggleSync = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (!userAddress) {
        setError('User address is required');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        // Update server settings
        const response = await fetch('/api/v1/sync/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            wallet: userAddress,
            syncEnabled: enabled,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update sync settings on server');
        }

        // Update local settings
        const updated = SyncStorage.toggleSync(enabled);
        setSettings(updated);

        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [userAddress],
  );

  const queue = SyncStorage.getQueue();
  const formattedLastSync =
    settings.lastSyncAt > 0 ? new Date(settings.lastSyncAt).toLocaleString() : 'Never';

  return {
    settings,
    loading,
    error,
    toggleSync,
    syncStatus: {
      lastSyncAt: settings.lastSyncAt,
      isPending: queue.length > 0,
      formattedLastSync,
    },
  };
}
