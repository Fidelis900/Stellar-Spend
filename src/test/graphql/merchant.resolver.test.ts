/**
 * Unit tests for the merchant/compliance domain GraphQL resolver module (#791)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  merchantQueries,
  merchantMutations,
  merchantSubscriptions,
} from '@/lib/graphql/resolvers/merchant';
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

function opsCtx(): GraphQLContext {
  return authedCtx({ role: 'ops' });
}

function adminCtx(): GraphQLContext {
  return authedCtx({ role: 'admin' });
}

// ── merchantQueries.screeningResult ──────────────────────────────────────────

describe('merchantQueries.screeningResult', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      merchantQueries.screeningResult(
        {},
        { address: 'GABC' },
        anonCtx(),
      ),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls screenAddress and maps result', async () => {
    const fakeResult = {
      verdict: 'clean',
      score: 0,
      flags: [],
      provider: 'chainalysis',
      screenedAt: 1_700_000_000_000,
    };
    vi.doMock('@/lib/compliance-screening', () => ({
      screenAddress: vi.fn().mockResolvedValue(fakeResult),
    }));

    const { merchantQueries: q } = await import(
      '@/lib/graphql/resolvers/merchant'
    );
    const result = await q.screeningResult(
      {},
      { address: 'GABC' },
      authedCtx(),
    );
    expect(result).toMatchObject({
      verdict: 'clean',
      score: 0,
      flags: [],
      provider: 'chainalysis',
    });
    expect(result.screenedAt).toBe(
      new Date(1_700_000_000_000).toISOString(),
    );
  });
});

// ── merchantQueries.screeningOverrides ───────────────────────────────────────

describe('merchantQueries.screeningOverrides', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller lacks ops role', async () => {
    await expect(
      merchantQueries.screeningOverrides({}, {}, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });

  it('allows ops-role caller', async () => {
    vi.doMock('@/lib/compliance-screening', () => ({
      getScreeningOverrides: vi.fn().mockReturnValue([]),
    }));

    const { merchantQueries: q } = await import(
      '@/lib/graphql/resolvers/merchant'
    );
    const result = await q.screeningOverrides({}, {}, opsCtx());
    expect(Array.isArray(result)).toBe(true);
  });

  it('allows admin-role caller', async () => {
    vi.doMock('@/lib/compliance-screening', () => ({
      getScreeningOverrides: vi.fn().mockReturnValue([]),
    }));

    const { merchantQueries: q } = await import(
      '@/lib/graphql/resolvers/merchant'
    );
    const result = await q.screeningOverrides({}, {}, adminCtx());
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── merchantQueries.analyticsSummary ─────────────────────────────────────────

describe('merchantQueries.analyticsSummary', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller lacks admin role', async () => {
    await expect(
      merchantQueries.analyticsSummary({}, {}, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });

  it('calls generateAnalyticsSummary', async () => {
    const fakeSummary = { totalTransactions: 10, totalVolume: '1000' };
    vi.doMock('@/lib/graphql/analytics', () => ({
      generateAnalyticsSummary: vi.fn().mockResolvedValue(fakeSummary),
    }));

    const { merchantQueries: q } = await import(
      '@/lib/graphql/resolvers/merchant'
    );
    const result = await q.analyticsSummary({}, {}, adminCtx());
    expect(result).toEqual(fakeSummary);
  });
});

// ── merchantMutations.addScreeningOverride ────────────────────────────────────

describe('merchantMutations.addScreeningOverride', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller lacks ops role', async () => {
    await expect(
      merchantMutations.addScreeningOverride(
        {},
        { address: 'GABC', verdict: 'blocked', reason: 'test' },
        authedCtx(),
      ),
    ).rejects.toThrow(/Forbidden/);
  });

  it('calls addScreeningOverride and returns true', async () => {
    const mockAdd = vi.fn();
    vi.doMock('@/lib/compliance-screening', () => ({
      addScreeningOverride: mockAdd,
    }));

    const { merchantMutations: m } = await import(
      '@/lib/graphql/resolvers/merchant'
    );
    const result = await m.addScreeningOverride(
      {},
      { address: 'GABC', verdict: 'blocked', reason: 'fraud' },
      opsCtx(),
    );
    expect(result).toBe(true);
    expect(mockAdd).toHaveBeenCalledWith(
      'GABC',
      'blocked',
      'fraud',
      'user_abc',
    );
  });
});

// ── merchantMutations.removeScreeningOverride ─────────────────────────────────

describe('merchantMutations.removeScreeningOverride', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller lacks ops role', async () => {
    await expect(
      merchantMutations.removeScreeningOverride(
        {},
        { address: 'GABC' },
        authedCtx(),
      ),
    ).rejects.toThrow(/Forbidden/);
  });

  it('calls removeScreeningOverride and returns true', async () => {
    const mockRemove = vi.fn();
    vi.doMock('@/lib/compliance-screening', () => ({
      removeScreeningOverride: mockRemove,
    }));

    const { merchantMutations: m } = await import(
      '@/lib/graphql/resolvers/merchant'
    );
    const result = await m.removeScreeningOverride(
      {},
      { address: 'GABC' },
      opsCtx(),
    );
    expect(result).toBe(true);
    expect(mockRemove).toHaveBeenCalledWith('GABC');
  });
});

// ── merchantSubscriptions ────────────────────────────────────────────────────

describe('merchantSubscriptions', () => {
  it('screeningAlert has subscribe function', () => {
    expect(
      typeof merchantSubscriptions.screeningAlert.subscribe,
    ).toBe('function');
  });
});
