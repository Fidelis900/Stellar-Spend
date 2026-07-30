import { pool as db } from '@/lib/db';

export interface BatchTransaction {
  id: string;
  batchId: string;
  transactionId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  payload?: Record<string, unknown>;
}

export interface BatchProgress {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  progressPercent: number;
}

export interface BatchAnalytics {
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  cancelledBatches: number;
  totalTransactions: number;
  successRate: number;
  avgBatchSize: number;
}

export async function createBatch(userId: string, totalAmount: number) {
  const result = await db.query(
    `INSERT INTO transaction_batches (user_id, total_amount, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [userId, totalAmount],
  );
  return result.rows[0];
}

export async function addTransactionToBatch(batchId: string, transactionData: any) {
  const result = await db.query(
    `INSERT INTO batch_transactions (batch_id, status, payload)
     VALUES ($1, 'pending', $2)
     RETURNING *`,
    [batchId, JSON.stringify(transactionData)],
  );
  return result.rows[0];
}

export async function updateBatchTransactionStatus(
  batchTransactionId: string,
  status: string,
  transactionId?: string,
  errorMessage?: string,
) {
  return db.query(
    `UPDATE batch_transactions
     SET status = $1, transaction_id = $2, error_message = $3
     WHERE id = $4
     RETURNING *`,
    [status, transactionId, errorMessage, batchTransactionId],
  );
}

export async function getBatchStatus(batchId: string) {
  const batch = await db.query(`SELECT * FROM transaction_batches WHERE id = $1`, [batchId]);
  const transactions = await db.query(`SELECT * FROM batch_transactions WHERE batch_id = $1`, [
    batchId,
  ]);
  return {
    batch: batch.rows[0],
    transactions: transactions.rows,
  };
}

export async function getBatchProgress(batchId: string): Promise<BatchProgress> {
  const { transactions } = await getBatchStatus(batchId);
  const total = transactions.length;
  const completed = transactions.filter((t: BatchTransaction) => t.status === 'completed').length;
  const failed = transactions.filter((t: BatchTransaction) => t.status === 'failed').length;
  const pending = transactions.filter((t: BatchTransaction) => t.status === 'pending').length;
  return {
    batchId,
    total,
    completed,
    failed,
    pending,
    progressPercent: total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
  };
}

export async function completeBatch(batchId: string) {
  return db.query(`UPDATE transaction_batches SET status = 'completed' WHERE id = $1 RETURNING *`, [
    batchId,
  ]);
}

export async function cancelBatch(batchId: string) {
  await db.query(
    `UPDATE batch_transactions SET status = 'cancelled' WHERE batch_id = $1 AND status = 'pending'`,
    [batchId],
  );
  return db.query(
    `UPDATE transaction_batches SET status = 'cancelled' WHERE id = $1 AND status IN ('pending', 'processing') RETURNING *`,
    [batchId],
  );
}

/**
 * Execute all pending transactions in a batch.
 * Handles partial failures: failed items are recorded individually; the batch
 * completes as long as at least one transaction succeeds.
 */
export async function executeBatch(
  batchId: string,
  handler: (txPayload: Record<string, unknown>) => Promise<string>,
): Promise<{ succeeded: number; failed: number; batchStatus: string }> {
  const { batch, transactions } = await getBatchStatus(batchId);
  if (!batch || batch.status === 'cancelled') {
    throw new Error('Batch not found or already cancelled');
  }

  await db.query(`UPDATE transaction_batches SET status = 'processing' WHERE id = $1`, [batchId]);

  let succeeded = 0;
  let failed = 0;

  for (const tx of transactions) {
    if (tx.status !== 'pending') continue;

    await updateBatchTransactionStatus(tx.id, 'processing');
    try {
      const transactionId = await handler(tx.payload ?? {});
      await updateBatchTransactionStatus(tx.id, 'completed', transactionId);
      succeeded++;
    } catch (err: any) {
      await updateBatchTransactionStatus(
        tx.id,
        'failed',
        undefined,
        err?.message ?? 'Unknown error',
      );
      failed++;
    }
  }

  const batchStatus = succeeded === 0 && failed > 0 ? 'failed' : 'completed';
  await db.query(`UPDATE transaction_batches SET status = $1 WHERE id = $2`, [
    batchStatus,
    batchId,
  ]);

  return { succeeded, failed, batchStatus };
}

export async function getBatchAnalytics(userId?: string): Promise<BatchAnalytics> {
  const params: unknown[] = userId ? [userId] : [];
  const userFilter = userId ? 'WHERE user_id = $1' : '';

  const batchRows = await db.query(
    `SELECT status, COUNT(*) as count FROM transaction_batches ${userFilter} GROUP BY status`,
    params,
  );

  const txRows = await db.query(
    `SELECT bt.status, COUNT(*) as count
     FROM batch_transactions bt
     JOIN transaction_batches tb ON bt.batch_id = tb.id
     ${userId ? 'WHERE tb.user_id = $1' : ''}
     GROUP BY bt.status`,
    params,
  );

  const batchCounts: Record<string, number> = {};
  for (const row of batchRows.rows) {
    batchCounts[row.status] = parseInt(row.count, 10);
  }

  const txCounts: Record<string, number> = {};
  for (const row of txRows.rows) {
    txCounts[row.status] = parseInt(row.count, 10);
  }

  const totalBatches = Object.values(batchCounts).reduce((a, b) => a + b, 0);
  const completedBatches = batchCounts['completed'] ?? 0;
  const failedBatches = batchCounts['failed'] ?? 0;
  const cancelledBatches = batchCounts['cancelled'] ?? 0;
  const totalTransactions = Object.values(txCounts).reduce((a, b) => a + b, 0);
  const completedTx = txCounts['completed'] ?? 0;

  return {
    totalBatches,
    completedBatches,
    failedBatches,
    cancelledBatches,
    totalTransactions,
    successRate: totalTransactions > 0 ? Math.round((completedTx / totalTransactions) * 100) : 0,
    avgBatchSize: totalBatches > 0 ? Math.round(totalTransactions / totalBatches) : 0,
  };
}
