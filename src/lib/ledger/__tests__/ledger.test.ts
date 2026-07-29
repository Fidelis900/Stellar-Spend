import { describe, expect, it, vi, beforeEach } from 'vitest';

const poolQueryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  pool: { query: poolQueryMock },
}));

import { recordDoubleEntry, recordFeeCapture, verifyAllAccountsBalanced } from '../entries';

describe('Ledger Entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a double entry (debit + credit)', async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'entry_1',
            transaction_id: 'tx_1',
            account_id: 'asset_cash',
            entry_type: 'debit',
            amount: '100.00',
            currency: 'USD',
            description: 'Test debit',
            reference_type: 'transaction',
            reference_id: 'tx_1',
            entry_hash: 'hash1',
            created_at: Date.now(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'entry_2',
            transaction_id: 'tx_1',
            account_id: 'revenue_fees',
            entry_type: 'credit',
            amount: '100.00',
            currency: 'USD',
            description: 'Test credit',
            reference_type: 'transaction',
            reference_id: 'tx_1',
            entry_hash: 'hash2',
            created_at: Date.now(),
          },
        ],
      });

    const [debit, credit] = await recordDoubleEntry(
      {
        transactionId: 'tx_1',
        accountId: 'asset_cash',
        amount: '100.00',
        currency: 'USD',
        description: 'Test debit',
        referenceType: 'transaction',
        referenceId: 'tx_1',
      },
      {
        transactionId: 'tx_1',
        accountId: 'revenue_fees',
        amount: '100.00',
        currency: 'USD',
        description: 'Test credit',
        referenceType: 'transaction',
        referenceId: 'tx_1',
      },
    );

    expect(debit.entryType).toBe('debit');
    expect(credit.entryType).toBe('credit');
    expect(debit.amount).toBe('100.00');
    expect(credit.amount).toBe('100.00');
    expect(poolQueryMock).toHaveBeenCalledTimes(2);
  });

  it('records a fee capture as double entry', async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'entry_3',
            transaction_id: 'tx_2',
            account_id: 'asset_fees_receivable',
            entry_type: 'debit',
            amount: '0.50',
            currency: 'USD',
            description: 'bridge fee charged for transaction tx_2',
            reference_type: 'transaction',
            reference_id: 'tx_2',
            entry_hash: 'hash3',
            created_at: Date.now(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'entry_4',
            transaction_id: 'tx_2',
            account_id: 'revenue_fees',
            entry_type: 'credit',
            amount: '0.50',
            currency: 'USD',
            description: 'bridge fee revenue from transaction tx_2',
            reference_type: 'transaction',
            reference_id: 'tx_2',
            entry_hash: 'hash4',
            created_at: Date.now(),
          },
        ],
      });

    const [debit, credit] = await recordFeeCapture('tx_2', '0.50', 'USD', 'bridge');

    expect(debit.entryType).toBe('debit');
    expect(credit.entryType).toBe('credit');
    expect(debit.accountId).toBe('asset_fees_receivable');
    expect(credit.accountId).toBe('revenue_fees');
  });

  it('verifies total debits equal total credits', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ total_debits: '100.50', total_credits: '100.50' }],
    });

    const result = await verifyAllAccountsBalanced();
    expect(result.balanced).toBe(true);
    expect(result.totalDebits).toBe('100.50');
    expect(result.totalCredits).toBe('100.50');
  });

  it('detects unbalanced entries', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ total_debits: '100.50', total_credits: '99.50' }],
    });

    const result = await verifyAllAccountsBalanced();
    expect(result.balanced).toBe(false);
    expect(result.difference).toBe('1');
  });
});
