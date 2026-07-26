/**
 * Unit tests for the accounts/KYC domain GraphQL resolver module (#791)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountQueries, accountMutations } from '@/lib/graphql/resolvers/accounts';
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

function adminCtx(): GraphQLContext {
  return authedCtx({ role: 'admin' });
}

// ── accountQueries.kycInfo ────────────────────────────────────────────────────

describe('accountQueries.kycInfo', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      accountQueries.kycInfo({}, { userId: 'u1' }, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('returns null when no KYC record found', async () => {
    vi.doMock('@/lib/kyc-limits', () => ({
      KYCLimitService: { getKYC: vi.fn().mockReturnValue(null) },
    }));

    const { accountQueries: q } = await import(
      '@/lib/graphql/resolvers/accounts'
    );
    const result = await q.kycInfo({}, { userId: 'missing' }, authedCtx());
    expect(result).toBeNull();
  });

  it('maps KYC record fields', async () => {
    const fakeKyc = {
      userId: 'u1',
      status: 'pending',
      documentType: 'passport',
      submittedAt: 1_700_000_000_000,
      verifiedAt: null,
      rejectionReason: null,
    };
    vi.doMock('@/lib/kyc-limits', () => ({
      KYCLimitService: { getKYC: vi.fn().mockReturnValue(fakeKyc) },
    }));

    const { accountQueries: q } = await import(
      '@/lib/graphql/resolvers/accounts'
    );
    const result = await q.kycInfo({}, { userId: 'u1' }, authedCtx());
    expect(result).toMatchObject({
      userId: 'u1',
      status: 'pending',
      documentType: 'passport',
    });
    expect(result!.submittedAt).toBe(
      new Date(1_700_000_000_000).toISOString(),
    );
    expect(result!.verifiedAt).toBeNull();
  });
});

// ── accountQueries.userLimits ─────────────────────────────────────────────────

describe('accountQueries.userLimits', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      accountQueries.userLimits({}, { userId: 'u1' }, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('returns null when no limits record', async () => {
    vi.doMock('@/lib/kyc-limits', () => ({
      KYCLimitService: { getUserLimits: vi.fn().mockReturnValue(null) },
      TIER_LIMITS: {},
    }));

    const { accountQueries: q } = await import(
      '@/lib/graphql/resolvers/accounts'
    );
    const result = await q.userLimits({}, { userId: 'u1' }, authedCtx());
    expect(result).toBeNull();
  });
});

// ── accountMutations.submitKYC ────────────────────────────────────────────────

describe('accountMutations.submitKYC', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      accountMutations.submitKYC(
        {},
        { userId: 'u1', documentType: 'passport', documentId: 'P001' },
        anonCtx(),
      ),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls KYCLimitService.submitKYC and maps response', async () => {
    const fakeKyc = {
      userId: 'u1',
      status: 'pending',
      documentType: 'passport',
      submittedAt: 1_700_000_000_000,
    };
    const mockSubmitKYC = vi.fn().mockReturnValue(fakeKyc);
    vi.doMock('@/lib/kyc-limits', () => ({
      KYCLimitService: { submitKYC: mockSubmitKYC },
    }));

    const { accountMutations: m } = await import(
      '@/lib/graphql/resolvers/accounts'
    );
    const result = await m.submitKYC(
      {},
      { userId: 'u1', documentType: 'passport', documentId: 'P001' },
      authedCtx(),
    );
    expect(mockSubmitKYC).toHaveBeenCalledWith('u1', 'passport', 'P001');
    expect(result).toMatchObject({ userId: 'u1', status: 'pending' });
  });
});

// ── accountMutations.approveKYC ───────────────────────────────────────────────

describe('accountMutations.approveKYC', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller is not admin', async () => {
    await expect(
      accountMutations.approveKYC({}, { userId: 'u1' }, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });

  it('throws when KYC record not found', async () => {
    vi.doMock('@/lib/kyc-limits', () => ({
      KYCLimitService: { verifyKYC: vi.fn().mockReturnValue(null) },
    }));

    const { accountMutations: m } = await import(
      '@/lib/graphql/resolvers/accounts'
    );
    await expect(
      m.approveKYC({}, { userId: 'u99' }, adminCtx()),
    ).rejects.toThrow(/No KYC found/);
  });
});

// ── accountMutations.rejectKYC ────────────────────────────────────────────────

describe('accountMutations.rejectKYC', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller is not admin', async () => {
    await expect(
      accountMutations.rejectKYC(
        {},
        { userId: 'u1', reason: 'forged docs' },
        authedCtx(),
      ),
    ).rejects.toThrow(/Forbidden/);
  });

  it('calls KYCLimitService.rejectKYC and maps response', async () => {
    const fakeKyc = {
      userId: 'u1',
      status: 'rejected',
      documentType: 'passport',
      submittedAt: 1_700_000_000_000,
      rejectionReason: 'forged docs',
    };
    vi.doMock('@/lib/kyc-limits', () => ({
      KYCLimitService: { rejectKYC: vi.fn().mockReturnValue(fakeKyc) },
    }));

    const { accountMutations: m } = await import(
      '@/lib/graphql/resolvers/accounts'
    );
    const result = await m.rejectKYC(
      {},
      { userId: 'u1', reason: 'forged docs' },
      adminCtx(),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      rejectionReason: 'forged docs',
    });
  });
});
