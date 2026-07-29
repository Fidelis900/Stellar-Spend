import { logger } from '@/lib/logger';
('use client');

import { useEffect, useState, useCallback } from 'react';
import type { Transaction } from './transaction-storage';
import { SyncStorage } from './sync-storage';
import { syncTransactionHistory, getSyncStatus } from './transaction-sync-client';

interface FailedTransaction extends Transaction {
  retryCount?: number;
  lastRetryAt?: number;
}

const DB_NAME = 'stellar-spend';
const STORE_NAME = 'failed-transactions';
const SYNC_STORE_NAME = 'transaction-sync-queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: number;
  isPending: boolean;
  conflictCount: number;
  syncing: boolean;
}

export function useBackgroundSync() {
  const [isSupported, setIsSupported] = useState(false);
  const [failedTransactions, setFailedTransactions] = useState<FailedTransaction[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    enabled: false,
    lastSyncAt: 0,
    isPending: false,
    conflictCount: 0,
    syncing: false,
  });

  const loadFailedTransactions = useCallback(async () => {
    try {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        setFailedTransactions(request.result);
      };
    } catch (err) {
      logger.error('Failed to load failed transactions:', {}, err);
    }
  }, []);

  const updateSyncStatus = useCallback(() => {
    const status = getSyncStatus();
    setSyncStatus((prev) => ({
      ...prev,
      ...status,
    }));
  }, []);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'SyncManager' in window;
    setIsSupported(supported);

    if (supported) {
      loadFailedTransactions();
      updateSyncStatus();

      // Update sync status every 5 seconds
      const interval = setInterval(updateSyncStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [loadFailedTransactions, updateSyncStatus]);

  const addFailedTransaction = async (tx: Transaction) => {
    if (!isSupported) return;

    try {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const failedTx: FailedTransaction = {
        ...tx,
        retryCount: 0,
        lastRetryAt: Date.now(),
      };
      store.put(failedTx);

      setFailedTransactions((prev) => [...prev, failedTx]);

      // Register background sync
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register('sync-failed-transactions');
      }
    } catch (err) {
      logger.error('Failed to add failed transaction:', {}, err);
    }
  };

  const removeFailedTransaction = async (txId: string) => {
    try {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(txId);

      setFailedTransactions((prev) => prev.filter((tx) => tx.id !== txId));
    } catch (err) {
      logger.error('Failed to remove failed transaction:', {}, err);
    }
  };

  const retryFailedTransaction = async (txId: string) => {
    try {
      const response = await fetch('/api/offramp/execute-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txId }),
      });

      if (response.ok) {
        await removeFailedTransaction(txId);
        return true;
      }
      return false;
    } catch (err) {
      logger.error('Failed to retry transaction:', {}, err);
      return false;
    }
  };

  const triggerHistorySync = async (userAddress: string, localTransactions: Transaction[]) => {
    setSyncStatus((prev) => ({ ...prev, syncing: true }));
    try {
      const result = await syncTransactionHistory(localTransactions, {
        userAddress,
      });

      if (result) {
        logger.info(`Synced ${result.synced.length} transactions`);
        if (result.conflicts.length > 0) {
          logger.warn(`${result.conflicts.length} conflicts detected`);
        }
      }
    } catch (err) {
      logger.error('Error syncing history:', {}, err);
    } finally {
      setSyncStatus((prev) => ({ ...prev, syncing: false }));
      updateSyncStatus();
    }
  };

  return {
    isSupported,
    failedTransactions,
    addFailedTransaction,
    removeFailedTransaction,
    retryFailedTransaction,
    loadFailedTransactions,
    syncStatus,
    updateSyncStatus,
    triggerHistorySync,
  };
}
