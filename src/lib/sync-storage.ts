import { logger } from '@/lib/logger';
/**
 * Sync Storage
 * Manages client-side sync state and metadata for transaction history synchronization
 */

export interface SyncSettings {
  syncEnabled: boolean;
  lastSyncAt: number;
  lastServerSyncAt: number;
  conflictResolutionStrategy: 'last-write-wins';
}

export interface SyncMetadata {
  transactionId: string;
  localVersion: number;
  serverVersion: number;
  lastModifiedAt: number;
  lastSyncedAt?: number;
  conflict?: boolean;
}

const SYNC_SETTINGS_KEY = 'stellar_spend_sync_settings';
const SYNC_METADATA_KEY = 'stellar_spend_sync_metadata';
const SYNC_QUEUE_KEY = 'stellar_spend_sync_queue';

export class SyncStorage {
  /**
   * Get or initialize sync settings
   */
  static getSettings(): SyncSettings {
    if (typeof window === 'undefined') {
      return this.getDefaultSettings();
    }

    try {
      const stored = localStorage.getItem(SYNC_SETTINGS_KEY);
      return stored ? JSON.parse(stored) : this.getDefaultSettings();
    } catch {
      return this.getDefaultSettings();
    }
  }

  /**
   * Update sync settings
   */
  static updateSettings(updates: Partial<SyncSettings>): SyncSettings {
    if (typeof window === 'undefined') return this.getDefaultSettings();

    const current = this.getSettings();
    const updated: SyncSettings = { ...current, ...updates };
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  }

  /**
   * Toggle sync on/off
   */
  static toggleSync(enabled: boolean): SyncSettings {
    return this.updateSettings({ syncEnabled: enabled });
  }

  /**
   * Get default sync settings
   */
  static getDefaultSettings(): SyncSettings {
    return {
      syncEnabled: false, // opt-in for privacy
      lastSyncAt: 0,
      lastServerSyncAt: 0,
      conflictResolutionStrategy: 'last-write-wins',
    };
  }

  /**
   * Get sync metadata for a transaction
   */
  static getMetadata(transactionId: string): SyncMetadata | undefined {
    if (typeof window === 'undefined') return undefined;

    try {
      const stored = localStorage.getItem(SYNC_METADATA_KEY);
      const metadata = stored ? JSON.parse(stored) : {};
      return metadata[transactionId];
    } catch {
      return undefined;
    }
  }

  /**
   * Set sync metadata for a transaction
   */
  static setMetadata(transactionId: string, metadata: SyncMetadata): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(SYNC_METADATA_KEY);
      const allMetadata = stored ? JSON.parse(stored) : {};
      allMetadata[transactionId] = metadata;
      localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify(allMetadata));
    } catch {
      logger.error('Failed to set sync metadata:', {}, transactionId);
    }
  }

  /**
   * Get all sync metadata
   */
  static getAllMetadata(): Record<string, SyncMetadata> {
    if (typeof window === 'undefined') return {};

    try {
      const stored = localStorage.getItem(SYNC_METADATA_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  /**
   * Add transaction to sync queue
   */
  static addToQueue(transactionId: string, action: 'create' | 'update' | 'delete'): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY);
      const queue = stored ? JSON.parse(stored) : [];

      // Remove duplicate entry if exists
      const filtered = queue.filter((item: any) => item.transactionId !== transactionId);

      filtered.push({
        transactionId,
        action,
        queuedAt: Date.now(),
      });

      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
    } catch (err) {
      logger.error('Failed to add to sync queue:', {}, err);
    }
  }

  /**
   * Get sync queue
   */
  static getQueue(): Array<{
    transactionId: string;
    action: 'create' | 'update' | 'delete';
    queuedAt: number;
  }> {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear sync queue
   */
  static clearQueue(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SYNC_QUEUE_KEY);
  }

  /**
   * Remove item from sync queue
   */
  static removeFromQueue(transactionId: string): void {
    if (typeof window === 'undefined') return;

    try {
      const queue = this.getQueue();
      const filtered = queue.filter((item) => item.transactionId !== transactionId);
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
    } catch (err) {
      logger.error('Failed to remove from sync queue:', {}, err);
    }
  }

  /**
   * Mark sync complete
   */
  static markSyncComplete(userAddress: string): void {
    this.updateSettings({
      lastSyncAt: Date.now(),
      lastServerSyncAt: Date.now(),
    });
  }

  /**
   * Clear all sync data (for logout or reset)
   */
  static clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SYNC_SETTINGS_KEY);
    localStorage.removeItem(SYNC_METADATA_KEY);
    localStorage.removeItem(SYNC_QUEUE_KEY);
  }
}
