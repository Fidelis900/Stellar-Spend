/**
 * Integration tests for ledger table reconciliation — #851
 *
 * This suite validates the double-entry ledger system defined in
 * migration 021_create_ledger_tables.sql.  It is the canonical place for
 * documenting the invariants that must always hold for financial correctness.
 *
 * ── Invariants (documented here and enforced by tests) ────────────────────────
 *
 * INVARIANT-1  Balance invariant (golden rule of double-entry bookkeeping)
 *   For every transaction recorded, the sum of all debit amounts MUST equal
 *   the sum of all credit amounts across the entire ledger.
 *     Σ debits == Σ credits  →  verifyAllAccountsBalanced().balanced === true
 *
 * INVARIANT-2  Per-transaction pairing
 *   Every transaction in the ledger MUST produce exactly one debit entry and
 *   exactly one credit entry of the same amount and currency.
 *
 * INVARIANT-3  Duplicate-entry prevention
 *   The SHA-256 entry_hash (derived from transactionId + accountId +
 *   entryType + amount + currency + referenceType + referenceId) MUST be
 *   unique.  Submitting the same logical entry twice MUST raise a
 *   `LedgerError` with the message "Duplicate ledger entry detected".
 *
 * INVARIANT-4  Reconciliation job detects imbalanced fixture data
 *   When the ledger contains orphaned entries (e.g. a debit with no
 *   corresponding credit), the `verifyAllAccountsBalanced()` function MUST
 *   return `balanced: false` with a non-zero `difference`.
 *
 * INVARIANT-5  reconcileAccount() status derivation
 *   - If |reported_balance − ledger_balance| == 0 → status = 'reconciled'
 *   - Otherwise                                   → status = 'discrepancy'
 *
 * INVARIANT-6  Fee capture produces balanced entries
 *   `recordFeeCapture()` MUST create a debit on `asset_fees_receivable` and a
 *   credit on `revenue_fees` for the same amount.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All DB calls are mocked so the suite runs in CI without a live Postgres
 * instance.  The mock faithfully reproduces aggregation SQL used by
 * `verifyAllAccountsBalanced()` and `verifyBalances()`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LedgerEntry } from '@/lib/ledger';

// ── Lightweight in-memory ledger ──────────────────────────────────────────────

type EntryRow = {
  id: string;
  transaction_id: string | null;
  account_id: string;
  entry_type: 'debit' | 'credit';
  amount: string;
  currency: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  entry_hash: string;
  created_at: number;
};

type ReconciliationRow = {
  id: string;
  report_id: string;
  account_id: string;
  reported_balance: string;
  ledger_balance: string;
  difference: string;
  status: 'unreconciled' | 'reconciled' | 'discrepancy';
  reconciled_at: number | null;
  notes: string | null;
  created_at: number;
};

let ledgerEntries: Map<string, EntryRow>;
let reconciliationRows: Map<string, ReconciliationRow>;
let seenHashes: Set<string>;
let counter: number;

function resetLedger() {
  ledgerEntries = new Map();
  reconciliationRows = new Map();
  seenHashes = new Set();
  counter = 0;
}

function nextId() {
  return `row-${++counter}`;
}

// Simulate aggregate SQL that `verifyAllAccountsBalanced` and `verifyBalances`
// use, plus INSERT queries for entries and reconciliation records.
function buildQueryMock() {
  return vi.fn().mockImplementation((sql: string, params: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // ── INSERT into ledger_entries ─────────────────────────────────────────
    if (/INSERT INTO ledger_entries/.test(s)) {
      const [
        id,
        txId,
        accountId,
        entryType,
        amount,
        currency,
        description,
        referenceType,
        referenceId,
        entryHash,
        createdAt,
      ] = params as [
        string,
        string | null,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
        number,
      ];

      // Enforce UNIQUE constraint on entry_hash (mirrors DB constraint)
      if (seenHashes.has(entryHash)) {
        const err: any = new Error('unique constraint violation');
        err.code = '23505';
        err.constraint = 'ledger_entries_entry_hash_key';
        throw err;
      }
      seenHashes.add(entryHash);

      const row: EntryRow = {
        id,
        transaction_id: txId,
        account_id: accountId,
        entry_type: entryType as 'debit' | 'credit',
        amount,
        currency,
        description,
        reference_type: referenceType,
        reference_id: referenceId,
        entry_hash: entryHash,
        created_at: createdAt,
      };
      ledgerEntries.set(id, row);
      return { rows: [row] };
    }

    // ── INSERT into ledger_reconciliation ──────────────────────────────────
    if (/INSERT INTO ledger_reconciliation/.test(s)) {
      const [
        id,
        reportId,
        accountId,
        reportedBal,
        ledgerBal,
        difference,
        status,
        reconciledAt,
        notes,
        createdAt,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number | null,
        string | null,
        number,
      ];
      const row: ReconciliationRow = {
        id,
        report_id: reportId,
        account_id: accountId,
        reported_balance: reportedBal,
        ledger_balance: ledgerBal,
        difference,
        status: status as ReconciliationRow['status'],
        reconciled_at: reconciledAt,
        notes,
        created_at: createdAt,
      };
      reconciliationRows.set(id, row);
      return { rows: [row] };
    }

    // ── verifyAllAccountsBalanced — global debit/credit totals ────────────
    if (
      /COALESCE\(SUM.*total_debits.*total_credits.*FROM ledger_entries\s*$/.test(s) ||
      (/FROM ledger_entries/.test(s) && /total_debits/.test(s) && !/WHERE account_id/.test(s))
    ) {
      let totalDebits = 0;
      let totalCredits = 0;
      for (const row of ledgerEntries.values()) {
        if (row.entry_type === 'debit') totalDebits += Number(row.amount);
        else totalCredits += Number(row.amount);
      }
      return {
        rows: [
          {
            total_debits: totalDebits.toFixed(2),
            total_credits: totalCredits.toFixed(2),
          },
        ],
      };
    }

    // ── verifyBalances — per-account debit/credit totals ──────────────────
    if (/FROM ledger_entries\s+WHERE account_id/.test(s)) {
      const [accountId] = params as [string];
      let totalDebits = 0;
      let totalCredits = 0;
      for (const row of ledgerEntries.values()) {
        if (row.account_id === accountId) {
          if (row.entry_type === 'debit') totalDebits += Number(row.amount);
          else totalCredits += Number(row.amount);
        }
      }
      return {
        rows: [
          {
            total_debits: totalDebits.toFixed(2),
            total_credits: totalCredits.toFixed(2),
          },
        ],
      };
    }

    // ── getEntriesByTransaction ────────────────────────────────────────────
    if (/FROM ledger_entries WHERE transaction_id/.test(s)) {
      const [txId] = params as [string];
      const rows = Array.from(ledgerEntries.values()).filter((r) => r.transaction_id === txId);
      return { rows };
    }

    // ── getEntriesByAccount ────────────────────────────────────────────────
    if (/FROM ledger_entries WHERE account_id/.test(s)) {
      const [accountId] = params as [string];
      const rows = Array.from(ledgerEntries.values()).filter((r) => r.account_id === accountId);
      return { rows };
    }

    // ── getReconciliationByReport ──────────────────────────────────────────
    if (/FROM ledger_reconciliation WHERE report_id/.test(s)) {
      const [reportId] = params as [string];
      const rows = Array.from(reconciliationRows.values()).filter((r) => r.report_id === reportId);
      return { rows };
    }

    // ── seedStandardAccounts ──────────────────────────────────────────────
    if (/INSERT INTO ledger_accounts/.test(s)) {
      return { rows: [] };
    }

    return { rows: [] };
  });
}

// ── Mock db/client ────────────────────────────────────────────────────────────

const poolQueryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  pool: { query: (...args: unknown[]) => poolQueryMock(...args) },
}));

// ── Import SUT after mocks are registered ─────────────────────────────────────

import {
  recordEntry,
  recordDoubleEntry,
  recordFeeCapture,
  verifyAllAccountsBalanced,
  verifyBalances,
  getEntriesByTransaction,
  seedStandardAccounts,
  LedgerError,
} from '@/lib/ledger';

import { reconcileAccount, getReconciliationByReport } from '@/lib/ledger';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal debit+credit pair for a given transaction.
 * Both sides carry the same `amount` and `currency` so INVARIANT-1 holds.
 */
async function recordBalancedTransaction(
  transactionId: string,
  amount: string,
  currency: string = 'USD',
): Promise<[LedgerEntry, LedgerEntry]> {
  return recordDoubleEntry(
    {
      transactionId,
      accountId: 'asset_cash',
      amount,
      currency,
      description: `Debit for ${transactionId}`,
      referenceType: 'transaction',
      referenceId: transactionId,
    },
    {
      transactionId,
      accountId: 'revenue_fees',
      amount,
      currency,
      description: `Credit for ${transactionId}`,
      referenceType: 'transaction',
      referenceId: transactionId,
    },
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('#851 — Ledger table reconciliation integration tests', () => {
  beforeEach(() => {
    resetLedger();
    poolQueryMock.mockImplementation(buildQueryMock());
  });

  // ─── INVARIANT-1: Global balance invariant ────────────────────────────────

  describe('INVARIANT-1 — Global balance (Σ debits == Σ credits)', () => {
    it('empty ledger is balanced', async () => {
      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(true);
      expect(result.totalDebits).toBe('0.00');
      expect(result.totalCredits).toBe('0.00');
      expect(result.difference).toBe('0');
    });

    it('balanced after recording a single transaction', async () => {
      await recordBalancedTransaction('tx-001', '100.00');
      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(true);
    });

    it('balanced after recording many transactions of different amounts', async () => {
      const amounts = ['50.00', '200.00', '0.01', '9999.99', '1.00'];
      await Promise.all(amounts.map((amt, i) => recordBalancedTransaction(`tx-multi-${i}`, amt)));
      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(true);
    });

    it('balanced after fee capture via recordFeeCapture()', async () => {
      await recordFeeCapture('tx-fee-001', '0.50', 'USD', 'bridge');
      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(true);
    });

    it('balanced for mixed NGN and USD transactions', async () => {
      // Each currency pair is individually balanced so the global ledger
      // balances in aggregate too (amounts are currency-agnostic in the DB)
      await recordBalancedTransaction('tx-ngn-01', '15000.00', 'NGN');
      await recordBalancedTransaction('tx-usd-01', '10.00', 'USD');
      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(true);
    });
  });

  // ─── INVARIANT-4: Broken fixture detection ────────────────────────────────

  describe('INVARIANT-4 — Reconciliation job detects imbalanced fixture data', () => {
    it('detects a ledger with an orphaned debit (no matching credit)', async () => {
      // Inject a debit-only entry directly — simulates a corrupt or partial write
      const orphanedDebit: EntryRow = {
        id: 'broken-entry-1',
        transaction_id: 'tx-broken-001',
        account_id: 'asset_cash',
        entry_type: 'debit',
        amount: '250.00',
        currency: 'USD',
        description: 'Orphaned debit — no credit counterpart',
        reference_type: 'transaction',
        reference_id: 'tx-broken-001',
        entry_hash: 'unique-broken-hash-001',
        created_at: Date.now(),
      };
      ledgerEntries.set(orphanedDebit.id, orphanedDebit);
      seenHashes.add(orphanedDebit.entry_hash);

      const result = await verifyAllAccountsBalanced();

      // INVARIANT-4: the job MUST report imbalance
      expect(result.balanced).toBe(false);
      expect(Number(result.difference)).not.toBe(0);
      expect(Number(result.totalDebits)).toBeGreaterThan(Number(result.totalCredits));
    });

    it('detects a ledger with an orphaned credit (no matching debit)', async () => {
      const orphanedCredit: EntryRow = {
        id: 'broken-entry-2',
        transaction_id: 'tx-broken-002',
        account_id: 'revenue_fees',
        entry_type: 'credit',
        amount: '75.50',
        currency: 'USD',
        description: 'Orphaned credit — no debit counterpart',
        reference_type: null,
        reference_id: null,
        entry_hash: 'unique-broken-hash-002',
        created_at: Date.now(),
      };
      ledgerEntries.set(orphanedCredit.id, orphanedCredit);
      seenHashes.add(orphanedCredit.entry_hash);

      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(false);
      expect(Number(result.totalCredits)).toBeGreaterThan(Number(result.totalDebits));
    });

    it('detects multiple imbalanced entries and sums the total difference correctly', async () => {
      // Two orphaned debits of 100 each — difference should be 200
      for (let i = 0; i < 2; i++) {
        const row: EntryRow = {
          id: `broken-${i}`,
          transaction_id: `tx-broken-b${i}`,
          account_id: 'asset_cash',
          entry_type: 'debit',
          amount: '100.00',
          currency: 'USD',
          description: null,
          reference_type: null,
          reference_id: null,
          entry_hash: `broken-hash-b${i}`,
          created_at: Date.now(),
        };
        ledgerEntries.set(row.id, row);
        seenHashes.add(row.entry_hash);
      }

      const result = await verifyAllAccountsBalanced();
      expect(result.balanced).toBe(false);
      expect(result.difference).toBe('200');
    });
  });

  // ─── INVARIANT-2: Per-transaction pairing ─────────────────────────────────

  describe('INVARIANT-2 — Per-transaction entry pairing', () => {
    it('every recorded transaction has exactly one debit and one credit entry', async () => {
      const txIds = ['tx-pair-1', 'tx-pair-2', 'tx-pair-3'];
      await Promise.all(txIds.map((id) => recordBalancedTransaction(id, '50.00')));

      for (const txId of txIds) {
        const entries = await getEntriesByTransaction(txId);
        expect(entries.length).toBe(2);

        const debits = entries.filter((e: LedgerEntry) => e.entryType === 'debit');
        const credits = entries.filter((e: LedgerEntry) => e.entryType === 'credit');
        expect(debits.length).toBe(1);
        expect(credits.length).toBe(1);
        expect(debits[0].amount).toBe(credits[0].amount);
        expect(debits[0].currency).toBe(credits[0].currency);
      }
    });
  });

  // ─── INVARIANT-3: Duplicate-entry prevention ──────────────────────────────

  describe('INVARIANT-3 — Duplicate-entry prevention', () => {
    it('throws LedgerError with "Duplicate" message on hash collision', async () => {
      const input = {
        transactionId: 'tx-dup-001',
        accountId: 'asset_cash',
        entryType: 'debit' as const,
        amount: '100.00',
        currency: 'USD',
        referenceType: 'transaction',
        referenceId: 'tx-dup-001',
      };

      // First insert succeeds
      await recordEntry(input);

      // Second insert with identical fields → hash collision → LedgerError
      await expect(recordEntry(input)).rejects.toThrow(LedgerError);
      await expect(recordEntry(input)).rejects.toThrow(/duplicate ledger entry/i);
    });

    it('allows re-use of the same accountId with different transactionIds', async () => {
      // Same accountId, different transactionId → different hash → OK
      await expect(recordBalancedTransaction('tx-unique-1', '10.00')).resolves.not.toThrow();
      await expect(recordBalancedTransaction('tx-unique-2', '10.00')).resolves.not.toThrow();
    });
  });

  // ─── INVARIANT-5: reconcileAccount status derivation ──────────────────────

  describe('INVARIANT-5 — reconcileAccount() status derivation', () => {
    it('status is `reconciled` when reported_balance matches ledger_balance', async () => {
      const record = await reconcileAccount(
        'asset_cash',
        'report-balanced-001',
        '500.00',
        '500.00',
      );
      expect(record.status).toBe('reconciled');
      expect(record.difference).toBe('0.00');
      expect(record.reconciledAt).toBeDefined();
    });

    it('status is `discrepancy` when balances differ', async () => {
      const record = await reconcileAccount(
        'asset_cash',
        'report-discrepancy-001',
        '500.00',
        '490.00',
        'Cash count differs from ledger',
      );
      expect(record.status).toBe('discrepancy');
      expect(record.difference).toBe('10.00');
      expect(record.reconciledAt).toBeUndefined();
    });

    it('records a note on the discrepancy row', async () => {
      const note = 'Found $10 difference after manual count';
      const record = await reconcileAccount(
        'revenue_fees',
        'report-notes-001',
        '1000.00',
        '990.00',
        note,
      );
      expect(record.notes).toBe(note);
    });

    it('getReconciliationByReport returns all rows for a given report', async () => {
      await reconcileAccount('asset_cash', 'report-multi', '200.00', '200.00');
      await reconcileAccount('revenue_fees', 'report-multi', '200.00', '180.00');

      const rows = await getReconciliationByReport('report-multi');
      expect(rows.length).toBe(2);
      expect(rows.some((r) => r.status === 'reconciled')).toBe(true);
      expect(rows.some((r) => r.status === 'discrepancy')).toBe(true);
    });
  });

  // ─── INVARIANT-6: Fee capture produces balanced entries ───────────────────

  describe('INVARIANT-6 — Fee capture produces balanced double entries', () => {
    it.each([
      ['bridge', 'asset_fees_receivable', 'revenue_fees'],
      ['payout', 'asset_fees_receivable', 'revenue_fees'],
      ['stablecoin', 'asset_fees_receivable', 'revenue_fees'],
    ] as const)(
      '%s fee capture debits %s and credits %s',
      async (feeType, expectedDebitAccount, expectedCreditAccount) => {
        const txId = `tx-fee-${feeType}`;
        const [debit, credit] = await recordFeeCapture(txId, '1.00', 'USD', feeType);

        expect(debit.entryType).toBe('debit');
        expect(debit.accountId).toBe(expectedDebitAccount);
        expect(credit.entryType).toBe('credit');
        expect(credit.accountId).toBe(expectedCreditAccount);
        expect(debit.amount).toBe(credit.amount);

        // Global balance must remain intact
        const balance = await verifyAllAccountsBalanced();
        expect(balance.balanced).toBe(true);
      },
    );
  });

  // ─── Per-account balance verification ─────────────────────────────────────

  describe('Per-account verifyBalances()', () => {
    it('returns zero debits and credits for an account with no entries', async () => {
      const result = await verifyBalances('no-entries-account');
      expect(result.debits).toBe('0.00');
      expect(result.credits).toBe('0.00');
      expect(result.balance).toBe('0');
    });

    it('returns correct debit and credit totals for a mixed-entry account', async () => {
      // Record 2 debits of $50 and 1 credit of $30 on the same account
      for (let i = 0; i < 2; i++) {
        const entryRow: EntryRow = {
          id: `manual-debit-${i}`,
          transaction_id: `tx-manual-${i}`,
          account_id: 'asset_cash',
          entry_type: 'debit',
          amount: '50.00',
          currency: 'USD',
          description: null,
          reference_type: null,
          reference_id: null,
          entry_hash: `manual-hash-debit-${i}`,
          created_at: Date.now(),
        };
        ledgerEntries.set(entryRow.id, entryRow);
        seenHashes.add(entryRow.entry_hash);
      }
      const creditRow: EntryRow = {
        id: 'manual-credit-0',
        transaction_id: 'tx-manual-credit',
        account_id: 'asset_cash',
        entry_type: 'credit',
        amount: '30.00',
        currency: 'USD',
        description: null,
        reference_type: null,
        reference_id: null,
        entry_hash: 'manual-hash-credit-0',
        created_at: Date.now(),
      };
      ledgerEntries.set(creditRow.id, creditRow);
      seenHashes.add(creditRow.entry_hash);

      const result = await verifyBalances('asset_cash');
      expect(result.debits).toBe('100.00');
      expect(result.credits).toBe('30.00');
      expect(result.balance).toBe('70');
    });
  });

  // ─── seedStandardAccounts smoke test ──────────────────────────────────────

  describe('seedStandardAccounts()', () => {
    it('runs without error (idempotent)', async () => {
      await expect(seedStandardAccounts()).resolves.not.toThrow();
      // Call twice to confirm idempotency
      await expect(seedStandardAccounts()).resolves.not.toThrow();
    });
  });
});
