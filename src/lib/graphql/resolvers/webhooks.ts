/**
 * GraphQL resolver module — webhooks / disputes domain
 *
 * Covers: webhook delivery queries, DLQ queries, webhook mutations (replay /
 * retry), dispute queries and mutations, and the disputeStatusChanged
 * subscription.
 */

import {
  getRecordsByStatus,
  getRecord,
  updateRecord,
} from '../../webhook/delivery-store';
import { list as listDLQ, replay as replayDLQ } from '../../webhook/dlq';
import type { GraphQLContext } from '../context';
import { requireAuth, requireRole } from '../auth-guards';

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const webhookQueries = {
  async webhookDelivery(
    _: unknown,
    { id }: { id: string },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    return getRecord(id);
  },

  async webhookDeliveries(
    _: unknown,
    {
      status = 'pending',
      limit = 50,
    }: { status?: string; limit?: number },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const records = await getRecordsByStatus(
      status as 'pending' | 'delivered' | 'failed',
    );
    return records.slice(0, limit);
  },

  async webhookStats(_: unknown, __: unknown, ctx: GraphQLContext) {
    requireAuth(ctx);
    const [pending, delivered, failed, dlqEntries] = await Promise.all([
      getRecordsByStatus('pending'),
      getRecordsByStatus('delivered'),
      getRecordsByStatus('failed'),
      listDLQ(),
    ]);
    return {
      pending: pending.length,
      delivered: delivered.length,
      failed: failed.length,
      dlqCount: dlqEntries.length,
    };
  },

  async dlqEntries(
    _: unknown,
    { limit = 50 }: { limit?: number },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const entries = await listDLQ();
    return entries.slice(0, limit);
  },

  async dispute(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireRole(ctx, 'admin');
    const { getDisputeById } = await import('../../repositories/dispute');
    return getDisputeById(id);
  },

  async disputes(
    _: unknown,
    { status, limit = 20 }: { status?: string; limit?: number },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    const { getDisputes } = await import('../../repositories/dispute');
    return getDisputes({ status, limit });
  },
};

// ─── Mutation Resolvers ───────────────────────────────────────────────────────

export const webhookMutations = {
  async replayWebhook(
    _: unknown,
    { dlqEntryId }: { dlqEntryId: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    return replayDLQ(dlqEntryId);
  },

  async retryWebhookDelivery(
    _: unknown,
    { deliveryId }: { deliveryId: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    const record = await getRecord(deliveryId);
    if (!record)
      throw new Error(`Delivery ${deliveryId} not found`);
    return updateRecord(deliveryId, {
      status: 'pending',
      nextAttemptAt: new Date().toISOString(),
    });
  },

  async createDispute(
    _: unknown,
    {
      transactionId,
      reason,
      evidence,
    }: {
      transactionId: string;
      reason: string;
      evidence?: string[];
    },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const { createDispute } = await import('../../repositories/dispute');
    return createDispute({
      transactionId,
      userId: ctx.userId!,
      reason,
      evidence,
    });
  },

  async resolveDispute(
    _: unknown,
    { id, resolution }: { id: string; resolution: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    const { resolveDispute } = await import('../../repositories/dispute');
    return resolveDispute(id, resolution, ctx.userId!);
  },
};

// ─── Subscription Resolvers ───────────────────────────────────────────────────

export const webhookSubscriptions = {
  disputeStatusChanged: {
    subscribe: async function* (_: unknown, { id }: { id: string }) {
      let lastStatus: string | null = null;
      while (true) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const { getDisputeById } = await import(
            '../../repositories/dispute'
          );
          const dispute = await getDisputeById(id);
          if (dispute && dispute.status !== lastStatus) {
            lastStatus = dispute.status;
            yield { disputeStatusChanged: dispute };
          }
        } catch {
          /* ignore transient errors */
        }
      }
    },
  },
};
