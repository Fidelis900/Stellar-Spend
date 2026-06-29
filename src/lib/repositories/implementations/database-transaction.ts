import { pool } from '../../db/client';
import { queryOptimizer } from '../../db/query-optimizer';
import type { TransactionRepository, Transaction } from './transaction';

async function timedQuery(sql: string, values: unknown[]) {
  const start = Date.now();
  const result = await pool.query(sql, values);
  queryOptimizer.recordQuery(sql, Date.now() - start, result.rowCount ?? 0);
  return result;
}

export class DatabaseTransactionRepository implements TransactionRepository {
  async save(transaction: Transaction): Promise<void> {
    const finalizedAt =
      transaction.finalizedAt ??
      (transaction.status === 'completed' || transaction.status === 'failed' ? Date.now() : null);

    const sql = `
      INSERT INTO transactions (
        id, timestamp, finalized_at, user_address, amount, currency,
        fee_method, bridge_fee, network_fee, paycrest_fee, total_fee,
        stellar_tx_hash, bridge_status, payout_order_id, payout_status,
        beneficiary_institution, beneficiary_account_identifier,
        beneficiary_account_name, beneficiary_currency,
        status, error
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21
      )
    `;

    const values = [
      transaction.id,
      transaction.timestamp,
      finalizedAt,
      transaction.userAddress,
      transaction.amount,
      transaction.currency,
      transaction.feeMethod ?? null,
      transaction.bridgeFee ?? null,
      transaction.networkFee ?? null,
      transaction.paycrestFee ?? null,
      transaction.totalFee ?? null,
      transaction.stellarTxHash ?? null,
      transaction.bridgeStatus ?? null,
      transaction.payoutOrderId ?? null,
      transaction.payoutStatus ?? null,
      transaction.beneficiary.institution,
      transaction.beneficiary.accountIdentifier,
      transaction.beneficiary.accountName,
      transaction.beneficiary.currency,
      transaction.status,
      transaction.error ?? null,
    ];

    await timedQuery(sql, values);
  }

  async update(id: string, updates: Partial<Transaction>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.bridgeStatus !== undefined) {
      setClauses.push(`bridge_status = $${paramIndex++}`);
      values.push(updates.bridgeStatus);
    }
    if (updates.payoutStatus !== undefined) {
      setClauses.push(`payout_status = $${paramIndex++}`);
      values.push(updates.payoutStatus);
    }
    if (updates.error !== undefined) {
      setClauses.push(`error = $${paramIndex++}`);
      values.push(updates.error);
    }
    if (updates.finalizedAt !== undefined) {
      setClauses.push(`finalized_at = $${paramIndex++}`);
      values.push(updates.finalizedAt);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    const sql = `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;

    await timedQuery(sql, values);
  }

  async getById(id: string): Promise<Transaction | null> {
    const result = await timedQuery('SELECT * FROM transactions WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.rowToTransaction(result.rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await timedQuery('DELETE FROM transactions WHERE id = $1', [id]);
  }

  async getAll(): Promise<Transaction[]> {
    const result = await timedQuery('SELECT * FROM transactions', []);
    return result.rows.map((row) => this.rowToTransaction(row));
  }

  async getByUser(userAddress: string): Promise<Transaction[]> {
    const result = await timedQuery(
      'SELECT * FROM transactions WHERE LOWER(user_address) = LOWER($1) ORDER BY created_at DESC',
      [userAddress],
    );
    return result.rows.map((row) => this.rowToTransaction(row));
  }

  async getByPayoutOrderId(orderId: string): Promise<Transaction | null> {
    const result = await timedQuery(
      'SELECT * FROM transactions WHERE payout_order_id = $1',
      [orderId],
    );
    return result.rows.length > 0 ? this.rowToTransaction(result.rows[0]) : null;
  }

  /** Batch fetch — avoids N+1 when loading multiple transactions by id */
  async getByIds(ids: string[]): Promise<Transaction[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await timedQuery(
      `SELECT * FROM transactions WHERE id IN (${placeholders})`,
      ids,
    );
    return result.rows.map((row) => this.rowToTransaction(row));
  }

  private rowToTransaction(row: Record<string, unknown>): Transaction {
    return {
      id: row.id as string,
      timestamp: Number(row.timestamp),
      finalizedAt: row.finalized_at ? Number(row.finalized_at) : undefined,
      userAddress: row.user_address as string,
      amount: row.amount as string,
      currency: row.currency as string,
      feeMethod: (row.fee_method as Transaction['feeMethod'] | null) ?? undefined,
      bridgeFee: (row.bridge_fee as string | null) ?? undefined,
      networkFee: (row.network_fee as string | null) ?? undefined,
      paycrestFee: (row.paycrest_fee as string | null) ?? undefined,
      totalFee: (row.total_fee as string | null) ?? undefined,
      stellarTxHash: (row.stellar_tx_hash as string | null) ?? undefined,
      bridgeStatus: (row.bridge_status as string | null) ?? undefined,
      payoutOrderId: (row.payout_order_id as string | null) ?? undefined,
      payoutStatus: (row.payout_status as string | null) ?? undefined,
      beneficiary: {
        institution: row.beneficiary_institution as string,
        accountIdentifier: row.beneficiary_account_identifier as string,
        accountName: row.beneficiary_account_name as string,
        currency: row.beneficiary_currency as string,
      },
      status: row.status as Transaction['status'],
      error: (row.error as string | null) ?? undefined,
    };
  }
}
