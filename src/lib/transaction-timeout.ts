import { dal } from '@/lib/db';
import type { Transaction } from '@/lib/transaction-storage';
import { processRefund } from '@/lib/refund';
import { notifyTransactionStatusUpdate } from '@/lib/notifications';
import { logger } from '@/lib/logger';

export const TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;
export const BRIDGE_TIMEOUT_MS = 60 * 60 * 1000;
export const PAYCREST_TIMEOUT_MS = 45 * 60 * 1000;

export const STAGE_TIMEOUTS = {
  draft: 10 * 60 * 1000,
  quoted: 10 * 60 * 1000,
  source_tx_submitted: 15 * 60 * 1000,
  bridge_pending: BRIDGE_TIMEOUT_MS,
  bridge_completed: 5 * 60 * 1000,
  payout_order_created: 10 * 60 * 1000,
  destination_tx_submitted: 15 * 60 * 1000,
  payout_pending: PAYCREST_TIMEOUT_MS,
} as const;

export type StallStage = keyof typeof STAGE_TIMEOUTS;

export const SAFE_STAGES: Set<StallStage> = new Set([
  'draft',
  'quoted',
  'source_tx_submitted',
  'bridge_pending',
]);
export const UNSAFE_STAGES: Set<StallStage> = new Set([
  'bridge_completed',
  'payout_order_created',
  'destination_tx_submitted',
  'payout_pending',
]);

export interface TimeoutCheckResult {
  transactionId: string;
  timedOut: boolean;
  ageMs: number;
  cancelled: boolean;
  refundTriggered: boolean;
  error?: string;
}

export interface StallCheckResult {
  transactionId: string;
  stage: StallStage | 'unknown';
  stalled: boolean;
  stageAgeMs: number;
  stageTimeoutMs: number;
  autoRetried: boolean;
  flaggedManual: boolean;
  error?: string;
}

export interface TimeoutMetrics {
  totalChecked: number;
  timedOut: number;
  refundTriggered: number;
  refundFailed: number;
  errors: number;
  bridgeTimeouts: number;
  paycrestTimeouts: number;
  stallsDetected: number;
  autoRetried: number;
  flaggedManual: number;
}

const _metrics: TimeoutMetrics = {
  totalChecked: 0,
  timedOut: 0,
  refundTriggered: 0,
  refundFailed: 0,
  errors: 0,
  bridgeTimeouts: 0,
  paycrestTimeouts: 0,
  stallsDetected: 0,
  autoRetried: 0,
  flaggedManual: 0,
};

export function getTimeoutMetrics(): Readonly<TimeoutMetrics> {
  return { ..._metrics };
}

export function resetTimeoutMetrics(): void {
  Object.assign(_metrics, {
    totalChecked: 0,
    timedOut: 0,
    refundTriggered: 0,
    refundFailed: 0,
    errors: 0,
    bridgeTimeouts: 0,
    paycrestTimeouts: 0,
    stallsDetected: 0,
    autoRetried: 0,
    flaggedManual: 0,
  });
}

function getTimeoutMs(tx: Transaction): number {
  if (tx.bridgeStatus !== undefined) return BRIDGE_TIMEOUT_MS;
  if (tx.payoutOrderId !== undefined) return PAYCREST_TIMEOUT_MS;
  return TRANSACTION_TIMEOUT_MS;
}

export function isTransactionTimedOut(tx: Transaction, nowMs = Date.now()): boolean {
  if (tx.status !== 'pending') return false;
  return nowMs - tx.timestamp > getTimeoutMs(tx);
}

export function getTransactionTimeoutType(tx: Transaction): 'bridge' | 'paycrest' | 'standard' {
  if (tx.bridgeStatus !== undefined) return 'bridge';
  if (tx.payoutOrderId !== undefined) return 'paycrest';
  return 'standard';
}

function inferStage(tx: Transaction): StallStage | 'unknown' {
  if (tx.bridgeStatus === 'pending' || tx.bridgeStatus === 'processing') return 'bridge_pending';
  if (tx.bridgeStatus === 'completed' && tx.payoutOrderId && tx.payoutStatus === undefined)
    return 'payout_order_created';
  if (tx.payoutStatus === 'pending') return 'payout_pending';
  if (tx.bridgeStatus === 'completed') return 'bridge_completed';
  return 'unknown';
}

function getStageStartTime(tx: Transaction): number {
  if (tx.bridgeStatus !== undefined && tx.stellarTxHash) return tx.timestamp;
  if (tx.payoutOrderId) return tx.timestamp;
  return tx.timestamp;
}

export function isStageStalled(tx: Transaction, nowMs = Date.now()): StallCheckResult {
  const stage = inferStage(tx);
  const stageAgeMs = nowMs - getStageStartTime(tx);
  const stageTimeoutMs = STAGE_TIMEOUTS[stage] ?? TRANSACTION_TIMEOUT_MS;
  const stalled = tx.status === 'pending' && stageAgeMs > stageTimeoutMs;

  if (stalled) {
    _metrics.stallsDetected++;
  }

  return {
    transactionId: tx.id,
    stage,
    stalled,
    stageAgeMs,
    stageTimeoutMs,
    autoRetried: false,
    flaggedManual: false,
  };
}

export async function handleStall(tx: Transaction): Promise<StallCheckResult> {
  const check = isStageStalled(tx);
  if (!check.stalled) return check;

  if (SAFE_STAGES.has(check.stage as StallStage)) {
    try {
      await dal.update(tx.id, {
        status: 'pending',
        error: `auto-retry after stall at ${check.stage}`,
      });
      _metrics.autoRetried++;
      check.autoRetried = true;
      logger.info('stall.auto_retried', { transactionId: tx.id, stage: check.stage });
      await notifyTransactionStatusUpdate({
        transaction: { ...tx, status: 'pending' },
        previousStatus: tx.status,
        previousPayoutStatus: tx.payoutStatus,
        source: 'stall_recovery',
      });
    } catch (err) {
      check.error = String(err);
      _metrics.errors++;
    }
  } else if (UNSAFE_STAGES.has(check.stage as StallStage)) {
    _metrics.flaggedManual++;
    check.flaggedManual = true;
    logger.warn('stall.flagged_manual', {
      transactionId: tx.id,
      stage: check.stage,
      ageMs: check.stageAgeMs,
    });
    await notifyTransactionStatusUpdate({
      transaction: tx,
      previousStatus: tx.status,
      previousPayoutStatus: tx.payoutStatus,
      source: 'stall_flagged',
    });
  }

  return check;
}

export async function cancelTimedOutTransaction(
  transactionId: string,
): Promise<TimeoutCheckResult> {
  const now = Date.now();
  let tx: Transaction | null;

  try {
    tx = await dal.getById(transactionId);
  } catch (err) {
    return {
      transactionId,
      timedOut: false,
      ageMs: 0,
      cancelled: false,
      refundTriggered: false,
      error: String(err),
    };
  }

  if (!tx) {
    return {
      transactionId,
      timedOut: false,
      ageMs: 0,
      cancelled: false,
      refundTriggered: false,
      error: 'Transaction not found',
    };
  }

  const ageMs = now - tx.timestamp;

  if (!isTransactionTimedOut(tx, now)) {
    return { transactionId, timedOut: false, ageMs, cancelled: false, refundTriggered: false };
  }

  const timeoutType = getTransactionTimeoutType(tx);
  logger.warn('transaction.timeout', {
    transactionId,
    userAddress: tx.userAddress,
    ageMs,
    timeoutType,
  });

  _metrics.timedOut++;
  if (timeoutType === 'bridge') _metrics.bridgeTimeouts++;
  if (timeoutType === 'paycrest') _metrics.paycrestTimeouts++;

  try {
    await dal.update(transactionId, { status: 'failed', error: 'Transaction timed out' });
    const updated = await dal.getById(transactionId);
    if (updated) {
      await notifyTransactionStatusUpdate({
        transaction: updated,
        previousStatus: tx.status,
        previousPayoutStatus: tx.payoutStatus,
        source: 'timeout',
      });
    }
  } catch (err) {
    _metrics.errors++;
    return {
      transactionId,
      timedOut: true,
      ageMs,
      cancelled: false,
      refundTriggered: false,
      error: String(err),
    };
  }

  const refundResult = await processRefund(transactionId, 'timeout');

  if (refundResult.success) {
    _metrics.refundTriggered++;
  } else {
    _metrics.refundFailed++;
  }

  return {
    transactionId,
    timedOut: true,
    ageMs,
    cancelled: true,
    refundTriggered: refundResult.success,
    error: refundResult.success ? undefined : refundResult.error,
  };
}

export async function checkAndCancelTimedOutTransactions(
  userAddress: string,
): Promise<TimeoutCheckResult[]> {
  let transactions: Transaction[];
  try {
    transactions = await dal.getByUser(userAddress);
  } catch {
    return [];
  }

  const pending = transactions.filter((tx) => tx.status === 'pending');
  _metrics.totalChecked += pending.length;
  const results = await Promise.all(pending.map((tx) => cancelTimedOutTransaction(tx.id)));
  return results.filter((r) => r.timedOut);
}

export async function scanAndCancelTimedOutTransactions(
  transactions: Transaction[],
): Promise<TimeoutCheckResult[]> {
  const pending = transactions.filter((tx) => tx.status === 'pending');
  _metrics.totalChecked += pending.length;
  const results = await Promise.all(pending.map((tx) => cancelTimedOutTransaction(tx.id)));
  return results.filter((r) => r.timedOut);
}

export async function scanStalledTransactions(
  transactions: Transaction[],
): Promise<StallCheckResult[]> {
  const pending = transactions.filter((tx) => tx.status === 'pending');
  _metrics.totalChecked += pending.length;
  const results = await Promise.all(pending.map((tx) => handleStall(tx)));
  return results.filter((r) => r.stalled);
}

export async function attemptTimeoutRecovery(
  transactionId: string,
): Promise<{ recovered: boolean; reason: string }> {
  let tx: Transaction | null;
  try {
    tx = await dal.getById(transactionId);
  } catch (err) {
    return { recovered: false, reason: String(err) };
  }

  if (!tx) return { recovered: false, reason: 'Transaction not found' };
  if (tx.status !== 'failed')
    return { recovered: false, reason: 'Transaction is not in failed state' };
  if (!tx.error?.includes('timed out'))
    return { recovered: false, reason: 'Transaction did not fail due to timeout' };

  if (getTransactionTimeoutType(tx) !== 'bridge') {
    return { recovered: false, reason: 'Only bridge transactions support timeout recovery' };
  }

  try {
    await dal.update(transactionId, { status: 'pending', error: undefined });
    logger.debug('transaction.timeout_recovery', { transactionId });
    return { recovered: true, reason: 'Transaction re-queued for bridge processing' };
  } catch (err) {
    return { recovered: false, reason: String(err) };
  }
}
