import { db } from '@/lib/db';

export interface ScheduledTransaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  scheduledFor: Date;
  status: 'scheduled' | 'executed' | 'cancelled';
  transactionId?: string;
}

export async function scheduleTransaction(
  userId: string,
  amount: number,
  currency: string,
  scheduledFor: Date,
) {
  const result = await db.query(
    `INSERT INTO scheduled_transactions (user_id, amount, currency, scheduled_for, status)
     VALUES ($1, $2, $3, $4, 'scheduled')
     RETURNING *`,
    [userId, amount, currency, scheduledFor],
  );
  return result.rows[0];
}

export async function getScheduledTransactions(userId: string) {
  const result = await db.query(
    `SELECT * FROM scheduled_transactions WHERE user_id = $1 AND status = 'scheduled'
     ORDER BY scheduled_for ASC`,
    [userId],
  );
  return result.rows;
}

export async function getPendingScheduledTransactions() {
  const now = new Date();
  const result = await db.query(
    `SELECT * FROM scheduled_transactions 
     WHERE status = 'scheduled' AND scheduled_for <= $1
     ORDER BY scheduled_for ASC`,
    [now],
  );
  return result.rows;
}

export async function executeScheduledTransaction(scheduledId: string, transactionId: string) {
  return db.query(
    `UPDATE scheduled_transactions 
     SET status = 'executed', transaction_id = $1
     WHERE id = $2
     RETURNING *`,
    [transactionId, scheduledId],
  );
}

export async function cancelScheduledTransaction(scheduledId: string) {
  return db.query(
    `UPDATE scheduled_transactions SET status = 'cancelled' WHERE id = $1 RETURNING *`,
    [scheduledId],
  );
}

export async function updateScheduledTransaction(scheduledId: string, scheduledFor: Date) {
  return db.query(
    `UPDATE scheduled_transactions SET scheduled_for = $1 WHERE id = $2 RETURNING *`,
    [scheduledFor, scheduledId],
  );
}
