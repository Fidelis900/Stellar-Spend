import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import type { LedgerReconciliation, ReconciliationStatus } from './types';

export class ReconciliationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ReconciliationError';
  }
}

export async function reconcileAccount(
  accountId: string,
  reportId: string,
  reportedBalance: string,
  ledgerBalance: string,
  notes?: string,
): Promise<LedgerReconciliation> {
  const id = randomUUID();
  const now = Date.now();
  const difference = (Number(reportedBalance) - Number(ledgerBalance)).toFixed(2);
  const status: ReconciliationStatus = difference === '0.00' ? 'reconciled' : 'discrepancy';

  const sql = `
    INSERT INTO ledger_reconciliation
      (id, report_id, account_id, reported_balance, ledger_balance, difference, status, reconciled_at, notes, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  try {
    const result = await pool.query(sql, [
      id,
      reportId,
      accountId,
      reportedBalance,
      ledgerBalance,
      difference,
      status,
      status === 'reconciled' ? now : null,
      notes ?? null,
      now,
    ]);
    return rowToReconciliation(result.rows[0]);
  } catch (err) {
    throw new ReconciliationError('Failed to create reconciliation record', err);
  }
}

export async function getReconciliationByReport(reportId: string): Promise<LedgerReconciliation[]> {
  const sql = `SELECT * FROM ledger_reconciliation WHERE report_id = $1 ORDER BY created_at DESC`;
  try {
    const result = await pool.query(sql, [reportId]);
    return result.rows.map(rowToReconciliation);
  } catch (err) {
    throw new ReconciliationError('Failed to get reconciliation by report', err);
  }
}

function rowToReconciliation(row: Record<string, unknown>): LedgerReconciliation {
  return {
    id: row.id as string,
    reportId: row.report_id as string,
    accountId: row.account_id as string,
    reportedBalance: row.reported_balance as string,
    ledgerBalance: row.ledger_balance as string,
    difference: row.difference as string,
    status: row.status as ReconciliationStatus,
    reconciledAt: row.reconciled_at ? Number(row.reconciled_at) : undefined,
    notes: (row.notes as string | null) ?? undefined,
    createdAt: Number(row.created_at),
  };
}
