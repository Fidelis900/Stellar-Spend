/**
 * Transaction Merge & Conflict Resolution
 * Implements last-write-wins strategy with audit trail
 */

import type { Transaction } from './transaction-storage';

export interface MergeResult {
  merged: Transaction[];
  conflicts: ConflictRecord[];
  strategy: 'last-write-wins';
}

export interface ConflictRecord {
  transactionId: string;
  localVersion: Transaction;
  serverVersion: Transaction;
  winner: 'local' | 'server';
  resolvedAt: number;
  reason: string;
}

/**
 * Merge local and server transaction histories
 * Uses last-write-wins strategy with timestamp comparison
 */
export function mergeTransactionHistories(
  local: Transaction[],
  server: Transaction[],
  conflictResolutionStrategy: 'last-write-wins' = 'last-write-wins',
): MergeResult {
  const conflicts: ConflictRecord[] = [];
  const localMap = new Map(local.map((tx) => [tx.id, tx]));
  const serverMap = new Map(server.map((tx) => [tx.id, tx]));
  const merged = new Map<string, Transaction>();

  // Process all transactions from both sources
  const allIds = new Set([...localMap.keys(), ...serverMap.keys()]);

  for (const txId of allIds) {
    const localTx = localMap.get(txId);
    const serverTx = serverMap.get(txId);

    if (!localTx) {
      // Only on server - use server version
      merged.set(txId, serverTx!);
    } else if (!serverTx) {
      // Only on local - use local version
      merged.set(txId, localTx);
    } else {
      // Both exist - resolve conflict using last-write-wins
      const resolvedTx = resolveConflict(localTx, serverTx, conflictResolutionStrategy);

      // Record the conflict for audit trail
      if (resolvedTx.winner === 'server') {
        conflicts.push({
          transactionId: txId,
          localVersion: localTx,
          serverVersion: serverTx,
          winner: 'server',
          resolvedAt: Date.now(),
          reason: `Server version newer (server: ${serverTx.finalizedAt || serverTx.timestamp}, local: ${localTx.finalizedAt || localTx.timestamp})`,
        });
      } else if (resolvedTx.winner === 'local') {
        conflicts.push({
          transactionId: txId,
          localVersion: localTx,
          serverVersion: serverTx,
          winner: 'local',
          resolvedAt: Date.now(),
          reason: `Local version newer (local: ${localTx.finalizedAt || localTx.timestamp}, server: ${serverTx.finalizedAt || serverTx.timestamp})`,
        });
      }

      merged.set(txId, resolvedTx.transaction);
    }
  }

  return {
    merged: Array.from(merged.values()),
    conflicts,
    strategy: conflictResolutionStrategy,
  };
}

interface ResolveResult {
  transaction: Transaction;
  winner: 'local' | 'server' | 'same';
}

/**
 * Resolve conflict between two versions using last-write-wins
 * Compares finalizedAt timestamp first, then timestamp
 */
function resolveConflict(
  local: Transaction,
  server: Transaction,
  strategy: 'last-write-wins',
): ResolveResult {
  if (strategy !== 'last-write-wins') {
    throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
  }

  // Get the authoritative timestamp for each transaction
  const localTime = local.finalizedAt || local.timestamp;
  const serverTime = server.finalizedAt || server.timestamp;

  // Last write wins - use the more recent timestamp
  if (serverTime > localTime) {
    return {
      transaction: server,
      winner: 'server',
    };
  } else if (localTime > serverTime) {
    return {
      transaction: local,
      winner: 'local',
    };
  } else {
    // Same timestamp - merge fields, preferring non-empty values
    // This handles metadata like notes, tags, favorites
    return {
      transaction: {
        ...server,
        note: local.note || server.note,
        tags: mergeArraysUnique(local.tags, server.tags),
        isFavorite: local.isFavorite || server.isFavorite,
      },
      winner: 'same',
    };
  }
}

/**
 * Merge two tag arrays, removing duplicates by id
 */
function mergeArraysUnique<T extends { id: string }>(
  arr1: T[] | undefined,
  arr2: T[] | undefined,
): T[] | undefined {
  if (!arr1 && !arr2) return undefined;
  if (!arr1) return arr2;
  if (!arr2) return arr1;

  const map = new Map(arr2.map((item) => [item.id, item]));
  arr1.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

/**
 * Find differences between two transaction sets
 * Useful for identifying what changed during sync
 */
export function findDifferences(
  local: Transaction[],
  server: Transaction[],
): {
  onlyLocal: Transaction[];
  onlyServer: Transaction[];
  modified: Array<{ local: Transaction; server: Transaction }>;
} {
  const localMap = new Map(local.map((tx) => [tx.id, tx]));
  const serverMap = new Map(server.map((tx) => [tx.id, tx]));

  const onlyLocal: Transaction[] = [];
  const onlyServer: Transaction[] = [];
  const modified: Array<{ local: Transaction; server: Transaction }> = [];

  for (const [id, localTx] of localMap) {
    if (!serverMap.has(id)) {
      onlyLocal.push(localTx);
    } else {
      const serverTx = serverMap.get(id)!;
      if (hasChanged(localTx, serverTx)) {
        modified.push({ local: localTx, server: serverTx });
      }
    }
  }

  for (const [id, serverTx] of serverMap) {
    if (!localMap.has(id)) {
      onlyServer.push(serverTx);
    }
  }

  return { onlyLocal, onlyServer, modified };
}

/**
 * Check if a transaction has changed between versions
 */
function hasChanged(tx1: Transaction, tx2: Transaction): boolean {
  // Compare key fields that indicate modification
  return (
    tx1.status !== tx2.status ||
    tx1.note !== tx2.note ||
    tx1.isFavorite !== tx2.isFavorite ||
    (tx1.finalizedAt || tx1.timestamp) !== (tx2.finalizedAt || tx2.timestamp)
  );
}
