/**
 * GraphQL resolver module — merchant / compliance domain
 *
 * Covers: screening queries, screening-override mutations, analytics summary
 * query, and the screeningAlert subscription.
 */

import type { GraphQLContext } from '../context';
import { requireAuth, requireRole } from '../auth-guards';

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const merchantQueries = {
  async screeningResult(
    _: unknown,
    { address }: { address: string },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const { screenAddress } = await import('../../compliance-screening');
    const result = await screenAddress({ address, addressType: 'stellar' });
    return {
      verdict: result.verdict,
      score: result.score,
      flags: result.flags,
      provider: result.provider,
      screenedAt: new Date(result.screenedAt).toISOString(),
    };
  },

  async screeningOverrides(_: unknown, __: unknown, ctx: GraphQLContext) {
    requireRole(ctx, 'ops');
    const { getScreeningOverrides } = await import('../../compliance-screening');
    return getScreeningOverrides();
  },

  async analyticsSummary(
    _: unknown,
    { from, to }: { from?: string; to?: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    const { generateAnalyticsSummary } = await import('../analytics');
    return generateAnalyticsSummary(
      from ? parseInt(from) : undefined,
      to ? parseInt(to) : undefined,
    );
  },
};

// ─── Mutation Resolvers ───────────────────────────────────────────────────────

export const merchantMutations = {
  async addScreeningOverride(
    _: unknown,
    {
      address,
      verdict,
      reason,
    }: { address: string; verdict: string; reason: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'ops');
    const { addScreeningOverride } = await import('../../compliance-screening');
    addScreeningOverride(address, verdict as any, reason, ctx.userId!);
    return true;
  },

  async removeScreeningOverride(
    _: unknown,
    { address }: { address: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'ops');
    const { removeScreeningOverride } = await import('../../compliance-screening');
    removeScreeningOverride(address);
    return true;
  },
};

// ─── Subscription Resolvers ───────────────────────────────────────────────────

export const merchantSubscriptions = {
  screeningAlert: {
    subscribe: async function* (
      _: unknown,
      { address }: { address: string },
    ) {
      const { screenAddress } = await import('../../compliance-screening');
      while (true) {
        await new Promise((r) => setTimeout(r, 60000));
        const result = await screenAddress({
          address,
          addressType: 'stellar',
        });
        yield {
          screeningAlert: {
            verdict: result.verdict,
            score: result.score,
            flags: result.flags,
            provider: result.provider,
            screenedAt: new Date(result.screenedAt).toISOString(),
          },
        };
      }
    },
  },
};
