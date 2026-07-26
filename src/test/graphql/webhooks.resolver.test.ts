/**
 * Unit tests for the webhooks/disputes domain GraphQL resolver module (#791)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  webhookQueries,
  webhookMutations,
  webhookSubscriptions,
} from '@/lib/graphql/resolvers/webhooks';
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

// ── Static mocks for delivery-store and dlq ───────────────────────────────────

vi.mock('@/lib/webhook/delivery-store', () => ({
  getRecord: vi.fn().mockResolvedValue(null),
  getRecordsByStatus: vi.fn().mockResolvedValue([]),
  updateRecord: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/webhook/dlq', () => ({
  list: vi.fn().mockResolvedValue([]),
  replay: vi.fn().mockResolvedValue({}),
}));

// ── webhookQueries ────────────────────────────────────────────────────────────

describe('webhookQueries.webhookDelivery', () => {
  it('throws when unauthenticated', async () => {
    await expect(
      webhookQueries.webhookDelivery({}, { id: 'del_1' }, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls getRecord with provided id', async () => {
    const { getRecord } = await import('@/lib/webhook/delivery-store');
    (getRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'del_1' });

    const result = await webhookQueries.webhookDelivery(
      {},
      { id: 'del_1' },
      authedCtx(),
    );
    expect(result).toEqual({ id: 'del_1' });
    expect(getRecord).toHaveBeenCalledWith('del_1');
  });
});

describe('webhookQueries.webhookDeliveries', () => {
  it('throws when unauthenticated', async () => {
    await expect(
      webhookQueries.webhookDeliveries({}, {}, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('defaults to pending status and respects limit 50', async () => {
    const { getRecordsByStatus } = await import('@/lib/webhook/delivery-store');
    (getRecordsByStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Array.from({ length: 60 }, (_, i) => ({ id: `d${i}` })),
    );

    const result = await webhookQueries.webhookDeliveries({}, {}, authedCtx());
    expect(result).toHaveLength(50);
    expect(getRecordsByStatus).toHaveBeenCalledWith('pending');
  });
});

describe('webhookQueries.webhookStats', () => {
  it('throws when unauthenticated', async () => {
    await expect(
      webhookQueries.webhookStats({}, {}, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('aggregates counts from all status buckets + dlq', async () => {
    const { getRecordsByStatus } = await import('@/lib/webhook/delivery-store');
    const { list } = await import('@/lib/webhook/dlq');

    (getRecordsByStatus as ReturnType<typeof vi.fn>).mockImplementation(
      (status: string) => {
        const map: Record<string, unknown[]> = {
          pending: [1, 2],
          delivered: [3, 4, 5],
          failed: [6],
        };
        return Promise.resolve(map[status] ?? []);
      },
    );
    (list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([7, 8]);

    const result = await webhookQueries.webhookStats({}, {}, authedCtx());
    expect(result).toEqual({ pending: 2, delivered: 3, failed: 1, dlqCount: 2 });
  });
});

describe('webhookQueries.dlqEntries', () => {
  it('throws when unauthenticated', async () => {
    await expect(
      webhookQueries.dlqEntries({}, {}, anonCtx()),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('slices results to provided limit', async () => {
    const { list } = await import('@/lib/webhook/dlq');
    (list as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({ id: `e${i}` })),
    );

    const result = await webhookQueries.dlqEntries({}, { limit: 10 }, authedCtx());
    expect(result).toHaveLength(10);
  });
});

// ── webhookQueries — disputes ─────────────────────────────────────────────────

describe('webhookQueries.dispute', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller lacks admin role', async () => {
    await expect(
      webhookQueries.dispute({}, { id: 'd_1' }, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });

  it('calls getDisputeById for admin', async () => {
    const fakeDispute = { id: 'd_1', status: 'open' };
    vi.doMock('@/lib/repositories/dispute', () => ({
      getDisputeById: vi.fn().mockResolvedValue(fakeDispute),
    }));

    const { webhookQueries: q } = await import('@/lib/graphql/resolvers/webhooks');
    const result = await q.dispute({}, { id: 'd_1' }, adminCtx());
    expect(result).toEqual(fakeDispute);
  });
});

// ── webhookMutations ──────────────────────────────────────────────────────────

describe('webhookMutations.replayWebhook', () => {
  it('throws when caller lacks admin role', async () => {
    await expect(
      webhookMutations.replayWebhook({}, { dlqEntryId: 'dlq_1' }, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });

  it('calls replayDLQ for admin', async () => {
    const { replay } = await import('@/lib/webhook/dlq');
    (replay as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'dlq_1' });

    const result = await webhookMutations.replayWebhook(
      {},
      { dlqEntryId: 'dlq_1' },
      adminCtx(),
    );
    expect(replay).toHaveBeenCalledWith('dlq_1');
    expect(result).toEqual({ id: 'dlq_1' });
  });
});

describe('webhookMutations.retryWebhookDelivery', () => {
  it('throws when caller lacks admin role', async () => {
    await expect(
      webhookMutations.retryWebhookDelivery({}, { deliveryId: 'del_1' }, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });

  it('throws when delivery record not found', async () => {
    const { getRecord } = await import('@/lib/webhook/delivery-store');
    (getRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      webhookMutations.retryWebhookDelivery({}, { deliveryId: 'missing' }, adminCtx()),
    ).rejects.toThrow(/not found/);
  });

  it('updates delivery status to pending for admin', async () => {
    const { getRecord, updateRecord } = await import('@/lib/webhook/delivery-store');
    (getRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'del_1' });
    (updateRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'del_1', status: 'pending' });

    const result = await webhookMutations.retryWebhookDelivery(
      {},
      { deliveryId: 'del_1' },
      adminCtx(),
    );
    expect(updateRecord).toHaveBeenCalledWith(
      'del_1',
      expect.objectContaining({ status: 'pending' }),
    );
    expect(result).toMatchObject({ status: 'pending' });
  });
});

describe('webhookMutations.createDispute', () => {
  beforeEach(() => vi.resetModules());

  it('throws when unauthenticated', async () => {
    await expect(
      webhookMutations.createDispute(
        {},
        { transactionId: 'tx_1', reason: 'fraud' },
        anonCtx(),
      ),
    ).rejects.toThrow(/Unauthorized/);
  });

  it('calls createDispute with userId from context', async () => {
    const fakeDispute = { id: 'd_1', status: 'open' };
    const mockCreate = vi.fn().mockResolvedValue(fakeDispute);
    vi.doMock('@/lib/repositories/dispute', () => ({ createDispute: mockCreate }));

    const { webhookMutations: m } = await import('@/lib/graphql/resolvers/webhooks');
    const result = await m.createDispute(
      {},
      { transactionId: 'tx_1', reason: 'fraud' },
      authedCtx({ userId: 'user_abc' }),
    );
    expect(mockCreate).toHaveBeenCalledWith({
      transactionId: 'tx_1',
      userId: 'user_abc',
      reason: 'fraud',
      evidence: undefined,
    });
    expect(result).toEqual(fakeDispute);
  });
});

describe('webhookMutations.resolveDispute', () => {
  beforeEach(() => vi.resetModules());

  it('throws when caller lacks admin role', async () => {
    await expect(
      webhookMutations.resolveDispute({}, { id: 'd_1', resolution: 'approved' }, authedCtx()),
    ).rejects.toThrow(/Forbidden/);
  });
});

// ── webhookSubscriptions ──────────────────────────────────────────────────────

describe('webhookSubscriptions', () => {
  it('disputeStatusChanged has subscribe function', () => {
    expect(typeof webhookSubscriptions.disputeStatusChanged.subscribe).toBe('function');
  });
});
