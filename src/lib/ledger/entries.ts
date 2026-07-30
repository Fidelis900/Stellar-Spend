import { createHash, randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import type { LedgerEntry, EntryType } from './types';

export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

function computeEntryHash(entry: {
  transactionId?: string;
  accountId: string;
  entryType: EntryType;
  amount: string;
  currency: string;
  referenceType?: string;
  referenceId?: string;
}): string {
  const payload = [
    entry.transactionId ?? '',
    entry.accountId,
    entry.entryType,
    entry.amount,
    entry.currency,
    entry.referenceType ?? '',
    entry.referenceId ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export async function recordEntry(
  input: Omit<LedgerEntry, 'id' | 'entryHash' | 'createdAt'>,
): Promise<LedgerEntry> {
  const id = randomUUID();
  const now = Date.now();
  const entryHash = computeEntryHash(input);

  const sql = `
    INSERT INTO ledger_entries
      (id, transaction_id, account_id, entry_type, amount, currency, description, reference_type, reference_id, entry_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  try {
    const result = await pool.query(sql, [
      id,
      input.transactionId ?? null,
      input.accountId,
      input.entryType,
      input.amount,
      input.currency,
      input.description ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      entryHash,
      now,
    ]);
    return rowToEntry(result.rows[0]);
  } catch (err: any) {
    if (err?.code === '23505' && err?.constraint?.includes('entry_hash')) {
      throw new LedgerError('Duplicate ledger entry detected', err);
    }
    throw new LedgerError('Failed to record ledger entry', err);
  }
}

export async function recordDoubleEntry(
  debit: Omit<LedgerEntry, 'id' | 'entryHash' | 'createdAt' | 'entryType'>,
  credit: Omit<LedgerEntry, 'id' | 'entryHash' | 'createdAt' | 'entryType'>,
): Promise<[LedgerEntry, LedgerEntry]> {
  const debitEntry = await recordEntry({ ...debit, entryType: 'debit' });
  const creditEntry = await recordEntry({ ...credit, entryType: 'credit' });
  return [debitEntry, creditEntry];
}

export async function recordFeeCapture(
  transactionId: string,
  feeAmount: string,
  feeCurrency: string,
  feeType: 'bridge' | 'payout' | 'stablecoin',
): Promise<[LedgerEntry, LedgerEntry]> {
  const feeRevenueAccountId = 'revenue_fees';
  const feeReceivableAccountId = 'asset_fees_receivable';

  return recordDoubleEntry(
    {
      transactionId,
      accountId: feeReceivableAccountId,
      amount: feeAmount,
      currency: feeCurrency,
      description: `${feeType} fee charged for transaction ${transactionId}`,
      referenceType: 'transaction',
      referenceId: transactionId,
    },
    {
      transactionId,
      accountId: feeRevenueAccountId,
      amount: feeAmount,
      currency: feeCurrency,
      description: `${feeType} fee revenue from transaction ${transactionId}`,
      referenceType: 'transaction',
      referenceId: transactionId,
    },
  );
}

export async function getEntriesByTransaction(transactionId: string): Promise<LedgerEntry[]> {
  const sql = `SELECT * FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at ASC`;
  try {
    const result = await pool.query(sql, [transactionId]);
    return result.rows.map(rowToEntry);
  } catch (err) {
    throw new LedgerError('Failed to get ledger entries for transaction', err);
  }
}

export async function getEntriesByAccount(
  accountId: string,
  limit = 100,
  offset = 0,
): Promise<LedgerEntry[]> {
  const sql = `SELECT * FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
  try {
    const result = await pool.query(sql, [accountId, limit, offset]);
    return result.rows.map(rowToEntry);
  } catch (err) {
    throw new LedgerError('Failed to get ledger entries for account', err);
  }
}

export async function verifyBalances(
  accountId: string,
): Promise<{ debits: string; credits: string; balance: string }> {
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount::numeric ELSE 0 END), 0) AS total_debits,
      COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END), 0) AS total_credits
    FROM ledger_entries
    WHERE account_id = $1
  `;
  try {
    const result = await pool.query(sql, [accountId]);
    const row = result.rows[0];
    const debits = row.total_debits.toString();
    const credits = row.total_credits.toString();
    const balance = (Number(row.total_debits) - Number(row.total_credits)).toString();
    return { debits, credits, balance };
  } catch (err) {
    throw new LedgerError('Failed to verify balances', err);
  }
}

export async function verifyAllAccountsBalanced(): Promise<{
  balanced: boolean;
  totalDebits: string;
  totalCredits: string;
  difference: string;
}> {
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount::numeric ELSE 0 END), 0) AS total_debits,
      COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END), 0) AS total_credits
    FROM ledger_entries
  `;
  try {
    const result = await pool.query(sql);
    const row = result.rows[0];
    const totalDebits = row.total_debits.toString();
    const totalCredits = row.total_credits.toString();
    const diff = Number(totalDebits) - Number(totalCredits);
    return {
      balanced: diff === 0,
      totalDebits,
      totalCredits,
      difference: diff.toString(),
    };
  } catch (err) {
    throw new LedgerError('Failed to verify all accounts balanced', err);
  }
}

export async function seedStandardAccounts(): Promise<void> {
  const accounts = [
    {
      id: 'asset_cash',
      code: '1000',
      name: 'Cash',
      type: 'asset' as const,
      category: 'current_assets',
      description: 'Cash and cash equivalents',
    },
    {
      id: 'asset_fees_receivable',
      code: '1100',
      name: 'Fees Receivable',
      type: 'asset' as const,
      category: 'receivables',
      description: 'Unsettled fee receivables',
    },
    {
      id: 'liability_payables',
      code: '2000',
      name: 'Settlement Payables',
      type: 'liability' as const,
      category: 'current_liabilities',
      description: 'Pending settlement amounts',
    },
    {
      id: 'equity_retained',
      code: '3000',
      name: 'Retained Earnings',
      type: 'equity' as const,
      category: 'equity',
      description: 'Retained earnings',
    },
    {
      id: 'revenue_fees',
      code: '4000',
      name: 'Fee Revenue',
      type: 'revenue' as const,
      category: 'operating_revenue',
      description: 'Transaction fee revenue',
    },
    {
      id: 'revenue_bridge_fees',
      code: '4100',
      name: 'Bridge Fee Revenue',
      type: 'revenue' as const,
      category: 'operating_revenue',
      description: 'Bridge fee revenue',
    },
    {
      id: 'revenue_payout_fees',
      code: '4200',
      name: 'Payout Fee Revenue',
      type: 'revenue' as const,
      category: 'operating_revenue',
      description: 'Payout fee revenue',
    },
    {
      id: 'expense_bridge_costs',
      code: '5000',
      name: 'Bridge Costs',
      type: 'expense' as const,
      category: 'operating_expenses',
      description: 'Cost of bridge transactions',
    },
    {
      id: 'expense_payout_costs',
      code: '5100',
      name: 'Payout Costs',
      type: 'expense' as const,
      category: 'operating_expenses',
      description: 'Cost of payout processing',
    },
  ];

  const now = Date.now();
  for (const account of accounts) {
    await pool.query(
      `INSERT INTO ledger_accounts (id, code, name, type, category, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        account.id,
        account.code,
        account.name,
        account.type,
        account.category,
        account.description ?? null,
        now,
      ],
    );
  }
}

function rowToEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: row.id as string,
    transactionId: (row.transaction_id as string | null) ?? undefined,
    accountId: row.account_id as string,
    entryType: row.entry_type as EntryType,
    amount: row.amount as string,
    currency: row.currency as string,
    description: (row.description as string | null) ?? undefined,
    referenceType: (row.reference_type as string | null) ?? undefined,
    referenceId: (row.reference_id as string | null) ?? undefined,
    entryHash: row.entry_hash as string,
    createdAt: Number(row.created_at),
  };
}
