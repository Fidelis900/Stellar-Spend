import { logger } from '@/lib/logger';
/**
 * Transaction Sync Client
 * Handles communication with server for transaction history synchronization
 */

import type { Transaction } from './transaction-storage';
import { SyncStorage } from './sync-storage';
import { mergeTransactionHistories } from './transaction-merge';

export interface SyncResponse {
  success: boolean;
  synced: Transaction[];
  conflicts: Array<{
    transactionId: string;
    reason: string;
  }>;
  timestamp: number;
}

export interface SyncOptions {
  userAddress: string;
  forceFullSync?: boolean;
}

/**
 * Sync transaction history with server
 */
export async function syncTransactionHistory(
  localTransactions: Transaction[],
  options: SyncOptions,
): Promise<SyncResponse | null> {
  const settings = SyncStorage.getSettings();

  if (!settings.syncEnabled) {
    logger.info('Sync is disabled');
    return null;
  }

  try {
    // Step 1: Fetch server history
    const serverTransactions = await fetchServerHistory(options.userAddress);

    if (!serverTransactions) {
      logger.error('Failed to fetch server history');
      return null;
    }

    // Step 2: Merge histories
    const mergeResult = mergeTransactionHistories(
      localTransactions,
      serverTransactions,
      settings.conflictResolutionStrategy,
    );

    // Step 3: Upload merged/local-only transactions
    const queue = SyncStorage.getQueue();
    const toUpload = localTransactions.filter(
      (tx) =>
        queue.some((q) => q.transactionId === tx.id) ||
        mergeResult.merged.some((m) => m.id === tx.id && m.id === tx.id),
    );

    if (toUpload.length > 0) {
      const uploadSuccess = await uploadTransactions(toUpload, options.userAddress);
      if (!uploadSuccess) {
        logger.error('Failed to upload transactions');
        return null;
      }
    }

    // Step 4: Update local metadata
    const metadata = SyncStorage.getAllMetadata();
    mergeResult.merged.forEach((tx) => {
      const existing = metadata[tx.id];
      SyncStorage.setMetadata(tx.id, {
        transactionId: tx.id,
        localVersion: existing?.localVersion || 1,
        serverVersion: (existing?.serverVersion || 0) + 1,
        lastModifiedAt: Date.now(),
        lastSyncedAt: Date.now(),
        conflict: false,
      });
    });

    // Step 5: Mark conflicts
    mergeResult.conflicts.forEach((conflict) => {
      const existing = metadata[conflict.transactionId];
      SyncStorage.setMetadata(conflict.transactionId, {
        transactionId: conflict.transactionId,
        localVersion: existing?.localVersion || 1,
        serverVersion: (existing?.serverVersion || 0) + 1,
        lastModifiedAt: Date.now(),
        lastSyncedAt: Date.now(),
        conflict: true,
      });
    });

    // Step 6: Clear sync queue on success
    SyncStorage.clearQueue();
    SyncStorage.markSyncComplete(options.userAddress);

    return {
      success: true,
      synced: mergeResult.merged,
      conflicts: mergeResult.conflicts.map((c) => ({
        transactionId: c.transactionId,
        reason: c.reason,
      })),
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error('Sync error:', {}, error);
    return null;
  }
}

/**
 * Fetch server transaction history for a user
 */
async function fetchServerHistory(userAddress: string): Promise<Transaction[] | null> {
  try {
    const response = await fetch(`/api/v1/sync/history?wallet=${encodeURIComponent(userAddress)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      logger.error('Failed to fetch server history:', {}, response.status);
      return null;
    }

    const data = await response.json();
    return data.transactions || [];
  } catch (error) {
    logger.error('Error fetching server history:', {}, error);
    return null;
  }
}

/**
 * Upload transactions to server
 */
async function uploadTransactions(
  transactions: Transaction[],
  userAddress: string,
): Promise<boolean> {
  try {
    const response = await fetch(`/api/v1/sync/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        wallet: userAddress,
        transactions,
        timestamp: Date.now(),
      }),
    });

    if (!response.ok) {
      logger.error('Failed to upload transactions:', {}, response.status);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error uploading transactions:', {}, error);
    return false;
  }
}

/**
 * Get sync status for display in UI
 */
export function getSyncStatus(): {
  enabled: boolean;
  lastSyncAt: number;
  isPending: boolean;
  conflictCount: number;
} {
  const settings = SyncStorage.getSettings();
  const metadata = SyncStorage.getAllMetadata();
  const conflictCount = Object.values(metadata).filter((m) => m.conflict).length;

  return {
    enabled: settings.syncEnabled,
    lastSyncAt: settings.lastSyncAt,
    isPending: SyncStorage.getQueue().length > 0,
    conflictCount,
  };
}
