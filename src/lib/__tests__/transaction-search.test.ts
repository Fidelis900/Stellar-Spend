import { describe, it, expect } from 'vitest';
import { TransactionSearchService } from '../transaction-search';
import type { Transaction } from '../transaction-storage';

const createMockTransaction = (overrides?: Partial<Transaction>): Transaction => ({
  id: `tx_${Math.random()}`,
  timestamp: Date.now(),
  userAddress: '0x123',
  amount: '100',
  currency: 'USDC',
  beneficiary: {
    institution: 'Bank A',
    accountIdentifier: '123456',
    accountName: 'John Doe',
    currency: 'NGN',
  },
  status: 'completed' as const,
  ...overrides,
});

describe('TransactionSearchService.search', () => {
  it('returns all transactions when no filters are set', () => {
    const txs = [createMockTransaction(), createMockTransaction()];
    expect(TransactionSearchService.search(txs, {})).toHaveLength(2);
  });

  it('filters by status', () => {
    const txs = [
      createMockTransaction({ id: 'a', status: 'completed' }),
      createMockTransaction({ id: 'b', status: 'failed' }),
    ];
    const result = TransactionSearchService.search(txs, { status: 'failed' });
    expect(result.map((t) => t.id)).toEqual(['b']);
  });

  it('filters by tags, matching any requested tag', () => {
    const txs = [
      createMockTransaction({ id: 'a', tags: [{ id: '1', name: 'urgent', color: '#fff' }] }),
      createMockTransaction({ id: 'b', tags: [{ id: '2', name: 'personal', color: '#fff' }] }),
      createMockTransaction({ id: 'c' }),
    ];
    const result = TransactionSearchService.search(txs, { tags: ['urgent', 'personal'] });
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('is case-insensitive when matching tags', () => {
    const txs = [createMockTransaction({ id: 'a', tags: [{ id: '1', name: 'Urgent', color: '#fff' }] })];
    const result = TransactionSearchService.search(txs, { tags: ['urgent'] });
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('matches notes via the free-text query', () => {
    const txs = [
      createMockTransaction({ id: 'a', note: 'refund pending review' }),
      createMockTransaction({ id: 'b', note: 'unrelated' }),
    ];
    const result = TransactionSearchService.search(txs, { query: 'refund' });
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('composes multiple filters (status + currency + amount range + tags)', () => {
    const txs = [
      createMockTransaction({
        id: 'match', status: 'failed', currency: 'NGN', amount: '50',
        tags: [{ id: '1', name: 'flagged', color: '#fff' }],
      }),
      createMockTransaction({ id: 'wrong-status', status: 'completed', currency: 'NGN', amount: '50' }),
      createMockTransaction({ id: 'wrong-currency', status: 'failed', currency: 'USD', amount: '50' }),
      createMockTransaction({ id: 'out-of-range', status: 'failed', currency: 'NGN', amount: '500' }),
      createMockTransaction({ id: 'no-tag', status: 'failed', currency: 'NGN', amount: '50' }),
    ];

    const result = TransactionSearchService.search(txs, {
      status: 'failed',
      currency: 'NGN',
      amountMax: 100,
      tags: ['flagged'],
    });

    expect(result.map((t) => t.id)).toEqual(['match']);
  });

  it('filters by date range', () => {
    const txs = [
      createMockTransaction({ id: 'too-old', timestamp: 1000 }),
      createMockTransaction({ id: 'in-range', timestamp: 5000 }),
      createMockTransaction({ id: 'too-new', timestamp: 9000 }),
    ];
    const result = TransactionSearchService.search(txs, { dateFrom: 2000, dateTo: 6000 });
    expect(result.map((t) => t.id)).toEqual(['in-range']);
  });
});
