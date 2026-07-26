/**
 * Unit tests for the transactions domain GraphQL resolver module (#791)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transactionQueries, transactionSubscriptions } from '@/lib/graphql/resolvers/transactions';
import type { GraphQLContext } from '@/lib/graphql/context';

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedCtx(overrides: Partial<GraphQLContext> = {}): GraphQLContext {
  return {
    userId: 'user_abc',
    isPremium: false,
    isAuthenticated: true,
    role: 'user',
    ...overrides,
  };
}

function anonCtx(): GraphQLContext {
  return {
    userId: undefined,
    isPremium: false,
    isAuthenticated: false,
    role: undefined,
  };
}

// ── transactionQueries ────────────────────────────────────────────────────────

describe('transactionQueries.transaction', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws when unauthenticated', async () => {
    await expect(
      transactionQueries.transaction({}, { id: 'tx_1' }, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls getTransactionById with provided id', async () => {
    const fakeTx = { id: 'tx_1', status: 'completed', amount: '100' };
    vi.doMock('@/lib/db/dal', () => ({
      getTransactionById: vi.fn().mockResolvedValue(fakeTx),
    }));

    const { transactionQueries: q } = await import(
      '@/lib/graphql/resolvers/transactions'
    );
    const result = await q.transaction({}, { id: 'tx_1' }, authedCtx());
    expect(result).toEqual(fakeTx);
  });
});

describe('transactionQueries.transactions', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      transactionQueries.transactions({}, {}, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls getTransactions with default pagination', async () => {
    const mockGetTransactions = vi.fn().mockResolvedValue([]);
    vi.doMock('@/lib/db/dal', () => ({
      getTransactions: mockGetTransactions,
    }));

    const { transactionQueries: q } = await import(
      '@/lib/graphql/resolvers/transactions'
    );
    await q.transactions({}, {}, authedCtx());
    expect(mockGetTransactions).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      status: undefined,
      currency: undefined,
    });
  });

  it('passes through filter params', async () => {
    const mockGetTransactions = vi.fn().mockResolvedValue([]);
    vi.doMock('@/lib/db/dal', () => ({
      getTransactions: mockGetTransactions,
    }));

    const { transactionQueries: q } = await import(
      '@/lib/graphql/resolvers/transactions'
    );
    await q.transactions(
      {},
      { limit: 5, offset: 10, status: 'completed', currency: 'NGN' },
      authedCtx(),
    );
    expect(mockGetTransactions).toHaveBeenCalledWith({
      limit: 5,
      offset: 10,
      status: 'completed',
      currency: 'NGN',
    });
  });
});

describe('transactionQueries.quote', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      transactionQueries.quote(
        {},
        { amount: '100', currency: 'NGN' },
        anonCtx(),
      ),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls getQuote with correct params including default feeMethod', async () => {
    const mockGetQuote = vi.fn().mockResolvedValue({ rate: 1600 });
    vi.doMock('@/lib/services/quote.service', () => ({
      getQuote: mockGetQuote,
    }));

    const { transactionQueries: q } = await import(
      '@/lib/graphql/resolvers/transactions'
    );
    await q.quote({}, { amount: '100', currency: 'NGN' }, authedCtx());
    expect(mockGetQuote).toHaveBeenCalledWith({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'USDC',
    });
  });
});

describe('transactionQueries.currencies', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      transactionQueries.currencies({}, {}, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls getCurrencies', async () => {
    const mockGetCurrencies = vi.fn().mockResolvedValue([{ code: 'NGN' }]);
    vi.doMock('@/lib/currencies', () => ({
      getCurrencies: mockGetCurrencies,
    }));

    const { transactionQueries: q } = await import(
      '@/lib/graphql/resolvers/transactions'
    );
    const result = await q.currencies({}, {}, authedCtx());
    expect(result).toEqual([{ code: 'NGN' }]);
  });
});

describe('transactionQueries.rate', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      transactionQueries.rate({}, {}, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('returns rate object with updatedAt', async () => {
    vi.doMock('@/lib/services/quote.service', () => ({
      getRate: vi.fn().mockResolvedValue(1598),
    }));

    const { transactionQueries: q } = await import(
      '@/lib/graphql/resolvers/transactions'
    );
    const result = await q.rate({}, { currency: 'NGN' }, authedCtx());
    expect(result).toMatchObject({ rate: 1598, currency: 'NGN' });
    expect(result.updatedAt).toBeDefined();
  });
});

// ── transactionSubscriptions ──────────────────────────────────────────────────

describe('transactionSubscriptions', () => {
  it('transactionStatusChanged has subscribe function', () => {
    expect(
      typeof transactionSubscriptions.transactionStatusChanged.subscribe,
    ).toBe('function');
  });

  it('rateUpdated has subscribe function', () => {
    expect(typeof transactionSubscriptions.rateUpdated.subscribe).toBe(
      'function',
    );
  });

  it('transactionCreated has subscribe function', () => {
    expect(
      typeof transactionSubscriptions.transactionCreated.subscribe,
    ).toBe('function');
  });
});
