import { logger } from '@/lib/logger';
/**
 * Automated refund service for failed/expired transactions.
 */
import { dal, DatabaseError } from '@/lib/db';
import type { Transaction } from '@/lib/transaction-storage';
import { notifyTransactionStatusUpdate } from '@/lib/notifications';

export type RefundReason = 'payment_failed' | 'timeout' | 'expired' | 'manual';

export interface RefundResult {
  transactionId: string;
  success: boolean;
  refundAmount: string;
  reason: RefundReason;
  error?: string;
  timestamp: string;
}

export interface RefundNotification {
  transactionId: string;
  userAddress: string;
  amount: string;
  currency: string;
  reason: RefundReason;
  timestamp: string;
}

/**
 * Determines if a transaction is eligible for refund.
 * Eligible: status is 'failed' or payoutStatus is 'expired'/'refunded' and not already completed.
 */
export function isRefundEligible(tx: Transaction): boolean {
  if (tx.status === 'completed') return false;
  if (tx.status === 'failed') return true;
  if (tx.payoutStatus === 'expired' || tx.payoutStatus === 'refunded') return true;
  return false;
}

/**
 * Calculates refund amount. For partial refunds, deducts any fees already incurred.
 * Currently returns full amount; extend with fee deduction logic as needed.
 */
export function calculateRefundAmount(tx: Transaction, partial = false): string {
  if (!partial) return tx.amount;
  // Partial refund: deduct a nominal processing fee (0.5%)
  const amount = parseFloat(tx.amount);
  if (isNaN(amount)) return tx.amount;
  const refund = amount * 0.995;
  return refund.toFixed(6);
}

/**
 * Processes a refund for a single transaction.
 * Updates DB status and emits a notification log.
 */
export async function processRefund(
  transactionId: string,
  reason: RefundReason,
  partial = false,
): Promise<RefundResult> {
  const timestamp = new Date().toISOString();

  let tx: Transaction | null;
  try {
    tx = await dal.getById(transactionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { transactionId, success: false, refundAmount: '0', reason, error: msg, timestamp };
  }

  if (!tx) {
    return {
      transactionId,
      success: false,
      refundAmount: '0',
      reason,
      error: 'Transaction not found',
      timestamp,
    };
  }

  if (!isRefundEligible(tx)) {
    return {
      transactionId,
      success: false,
      refundAmount: '0',
      reason,
      error: 'Transaction not eligible for refund',
      timestamp,
    };
  }

  const refundAmount = calculateRefundAmount(tx, partial);

  try {
    await dal.update(transactionId, {
      status: 'failed',
      payoutStatus: 'refunded',
      error: `Refunded: ${reason}`,
    });
  } catch (err) {
    const msg = err instanceof DatabaseError ? err.message : String(err);
    return { transactionId, success: false, refundAmount, reason, error: msg, timestamp };
  }

  const updated = await dal.getById(transactionId);
  if (updated) {
    await notifyTransactionStatusUpdate({
      transaction: updated,
      previousStatus: tx.status,
      previousPayoutStatus: tx.payoutStatus,
      source: 'refund',
    });
  }

  const notification: RefundNotification = {
    transactionId,
    userAddress: tx.userAddress,
    amount: refundAmount,
    currency: tx.currency,
    reason,
    timestamp,
  };

  emitRefundNotification(notification);

  return { transactionId, success: true, refundAmount, reason, timestamp };
}

/**
 * Detects all transactions eligible for refund and processes them.
 * Returns results for each processed transaction.
 */
export async function processEligibleRefunds(userAddress?: string): Promise<RefundResult[]> {
  let transactions: Transaction[];
  try {
    if (userAddress) {
      transactions = await dal.getByUser(userAddress);
    } else {
      // No bulk-fetch in DAL; this is a no-op without a userAddress unless extended
      return [];
    }
  } catch {
    return [];
  }

  const eligible = transactions.filter(isRefundEligible);
  const results = await Promise.all(eligible.map((tx) => processRefund(tx.id, 'payment_failed')));
  return results;
}

/**
 * Emits a refund notification (structured log; extend with email/webhook as needed).
 */
function emitRefundNotification(notification: RefundNotification): void {
  logger.info('refund.processed', { ...notification });
}
