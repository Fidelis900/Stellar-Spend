/**
 * GraphQL resolver module — accounts / KYC domain
 *
 * Covers: kycInfo query, userLimits query, submitKYC / approveKYC / rejectKYC
 * mutations.
 */

import type { GraphQLContext } from '../context';
import { requireAuth, requireRole } from '../auth-guards';

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const accountQueries = {
  async kycInfo(
    _: unknown,
    { userId }: { userId: string },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const { KYCLimitService } = await import('../../kyc-limits');
    const kyc = KYCLimitService.getKYC(userId);
    if (!kyc) return null;
    return {
      userId: kyc.userId,
      status: kyc.status,
      documentType: kyc.documentType,
      submittedAt: new Date(kyc.submittedAt).toISOString(),
      verifiedAt: kyc.verifiedAt ? new Date(kyc.verifiedAt).toISOString() : null,
      rejectionReason: kyc.rejectionReason,
    };
  },

  async userLimits(
    _: unknown,
    { userId }: { userId: string },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const { KYCLimitService, TIER_LIMITS } = await import('../../kyc-limits');
    const limits = KYCLimitService.getUserLimits(userId);
    if (!limits) return null;
    const tier = TIER_LIMITS[limits.tier as keyof typeof TIER_LIMITS];
    return {
      userId: limits.userId,
      tier: limits.tier,
      dailyLimit: tier.dailyLimit,
      monthlyLimit: tier.monthlyLimit,
      transactionLimit: tier.transactionLimit,
      dailyUsed: limits.dailyUsed,
      monthlyUsed: limits.monthlyUsed,
    };
  },
};

// ─── Mutation Resolvers ───────────────────────────────────────────────────────

export const accountMutations = {
  async submitKYC(
    _: unknown,
    {
      userId,
      documentType,
      documentId,
    }: { userId: string; documentType: string; documentId: string },
    ctx: GraphQLContext,
  ) {
    requireAuth(ctx);
    const { KYCLimitService } = await import('../../kyc-limits');
    const kyc = KYCLimitService.submitKYC(userId, documentType, documentId);
    return {
      userId: kyc.userId,
      status: kyc.status,
      documentType: kyc.documentType,
      submittedAt: new Date(kyc.submittedAt).toISOString(),
    };
  },

  async approveKYC(
    _: unknown,
    { userId }: { userId: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    const { KYCLimitService } = await import('../../kyc-limits');
    const kyc = KYCLimitService.verifyKYC(userId);
    if (!kyc) throw new Error(`No KYC found for user ${userId}`);
    return {
      userId: kyc.userId,
      status: kyc.status,
      documentType: kyc.documentType,
      submittedAt: new Date(kyc.submittedAt).toISOString(),
      verifiedAt: kyc.verifiedAt ? new Date(kyc.verifiedAt).toISOString() : null,
    };
  },

  async rejectKYC(
    _: unknown,
    { userId, reason }: { userId: string; reason: string },
    ctx: GraphQLContext,
  ) {
    requireRole(ctx, 'admin');
    const { KYCLimitService } = await import('../../kyc-limits');
    const kyc = KYCLimitService.rejectKYC(userId, reason);
    if (!kyc) throw new Error(`No KYC found for user ${userId}`);
    return {
      userId: kyc.userId,
      status: kyc.status,
      documentType: kyc.documentType,
      submittedAt: new Date(kyc.submittedAt).toISOString(),
      rejectionReason: kyc.rejectionReason,
    };
  },
};
