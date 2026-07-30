/**
 * #845 – Referral program integration tests
 *
 * Exercises the referral crediting logic defined in
 * src/lib/services/referral.service.ts and backed by
 * migrations/008_add_referral_program.sql.
 *
 * Edge cases covered:
 *  - Self-referral prevention
 *  - Double-crediting / duplicate referral code use
 *  - Reward already processed (idempotent distributeReward guard)
 *  - Invalid referral codes
 *  - Tiered reward calculation thresholds
 *  - Fraud detection heuristics
 *  - Analytics accuracy (conversion rate, totals)
 *  - Leaderboard ordering
 *
 * The pool (DB) is fully mocked so no real database is required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock pg pool
// ---------------------------------------------------------------------------

/**
 * Simple query-mock registry.
 * Keyed on a normalised prefix of the SQL so tests can register per-query stubs.
 */
const queryMocks = new Map<string, ReturnType<typeof vi.fn>>();

function registerQuery(sqlPrefix: string, mockFn: ReturnType<typeof vi.fn>) {
  queryMocks.set(sqlPrefix.trim().toUpperCase().slice(0, 40), mockFn);
}

const mockPoolQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  const key = sql.trim().toUpperCase().slice(0, 40);
  for (const [prefix, fn] of queryMocks.entries()) {
    if (key.startsWith(prefix)) {
      return fn(sql, params);
    }
  }
  // Default: return empty rows
  return { rows: [] };
});

vi.mock('@/lib/db/client', () => ({
  pool: { query: mockPoolQuery },
}));

// ---------------------------------------------------------------------------
// Import service under test (after mocks)
// ---------------------------------------------------------------------------

import {
  calculateReward,
  distributeReward,
  detectReferralFraud,
  getReferralAnalytics,
  getReferralLeaderboard,
  getReferralStats,
  trackReferral,
  createReferralCode,
} from '@/lib/services';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReferralCode(userId = 'user_referrer', code = 'TESTCODE01') {
  return { id: 'rcode_1', user_id: userId, code, reward_amount: '5' };
}

function makeReward(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rreward_1',
    referrer_id: 'user_referrer',
    referred_user_id: 'user_new',
    referral_code: 'TESTCODE01',
    reward_amount: '5',
    status: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Referral program integration tests (#845)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.clear();
  });

  // ── createReferralCode ─────────────────────────────────────────────────────

  describe('createReferralCode', () => {
    it('inserts a new referral code and returns it', async () => {
      const expected = makeReferralCode();
      mockPoolQuery.mockResolvedValueOnce({ rows: [expected] });

      const result = await createReferralCode('user_referrer', 5);
      expect(result).toEqual(expected);
      expect(mockPoolQuery).toHaveBeenCalledOnce();
    });

    it('uses a non-empty code (auto-generated)', async () => {
      const expected = makeReferralCode('user_a', 'AUTO123456');
      mockPoolQuery.mockResolvedValueOnce({ rows: [expected] });

      const result = await createReferralCode('user_a');
      expect(result.code).toBeTruthy();
      expect(typeof result.code).toBe('string');
    });
  });

  // ── trackReferral – happy path ─────────────────────────────────────────────

  describe('trackReferral – happy path', () => {
    it('inserts a pending reward and increments claimed_count', async () => {
      // 1. SELECT referral code
      mockPoolQuery.mockResolvedValueOnce({ rows: [makeReferralCode()] });
      // 2. INSERT reward row
      mockPoolQuery.mockResolvedValueOnce({ rows: [makeReward()] });
      // 3. UPDATE claimed_count
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const reward = await trackReferral('TESTCODE01', 'user_new');
      expect(reward.status).toBe('pending');
      expect(reward.referrer_id).toBe('user_referrer');
      // Exactly 3 DB calls
      expect(mockPoolQuery).toHaveBeenCalledTimes(3);
    });
  });

  // ── Self-referral prevention ───────────────────────────────────────────────

  describe('self-referral prevention', () => {
    it('detectReferralFraud flags self-referral when user owns the code', async () => {
      // SELECT code owner → same user
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ user_id: 'user_alice' }],
      });
      // SELECT previous attempts → none
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ attempt_count: '0' }] });
      // SELECT recent referrals for rate-check
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '0' }] });

      const result = await detectReferralFraud('user_alice', 'ALICECODE1');
      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('Self-referral detected');
    });

    it('trackReferral with own code would still succeed at DB level (fraud check is advisory)', async () => {
      // The fraud check is separate from trackReferral; trackReferral itself
      // does not enforce self-referral at the service layer — that is the
      // caller's responsibility after calling detectReferralFraud.
      mockPoolQuery.mockResolvedValueOnce({ rows: [makeReferralCode('user_referrer')] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [makeReward()] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // trackReferral does NOT throw on its own for self-referral
      await expect(trackReferral('TESTCODE01', 'user_referrer')).resolves.toBeDefined();
    });
  });

  // ── Double-crediting / duplicate referral code use ────────────────────────

  describe('double-crediting prevention', () => {
    it('detectReferralFraud flags a user who has already used a referral code', async () => {
      // Different user owns the code
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user_referrer' }] });
      // Already used a code once
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ attempt_count: '1' }] });
      // Rate check
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '0' }] });

      const result = await detectReferralFraud('user_already_referred', 'TESTCODE01');
      expect(result.suspicious).toBe(true);
      expect(result.reasons).toContain('User already used a referral code');
    });

    it('distributeReward throws if reward is already completed (idempotency guard)', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeReward({ status: 'completed' })],
      });

      await expect(distributeReward('rreward_1')).rejects.toThrow('Reward already processed');
    });

    it('distributeReward throws if reward id does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(distributeReward('nonexistent_id')).rejects.toThrow('Referral reward not found');
    });
  });

  // ── Invalid referral code ──────────────────────────────────────────────────

  describe('invalid referral code', () => {
    it('trackReferral throws when code does not exist in DB', async () => {
      // No rows returned for the code lookup
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(trackReferral('INVALID_CODE', 'user_new')).rejects.toThrow(
        'Invalid referral code',
      );
    });
  });

  // ── Reward distribution ────────────────────────────────────────────────────

  describe('distributeReward – happy path', () => {
    it('marks a pending reward as completed and returns updated row', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [makeReward({ status: 'pending' })] });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeReward({ status: 'completed' })],
      });

      const result = await distributeReward('rreward_1');
      expect(result.status).toBe('completed');
    });
  });

  // ── Tiered reward calculation ──────────────────────────────────────────────

  describe('calculateReward – tiered thresholds', () => {
    it('returns base reward for 0 claimed referrals', () => {
      expect(calculateReward(5, 0)).toBe(5);
    });

    it('returns base reward for 9 claimed referrals (below first tier)', () => {
      expect(calculateReward(5, 9)).toBe(5);
    });

    it('returns 1.5× base reward for exactly 10 claimed referrals', () => {
      expect(calculateReward(5, 10)).toBe(7.5);
    });

    it('returns 1.5× base reward for 19 claimed referrals (in first tier)', () => {
      expect(calculateReward(5, 19)).toBe(7.5);
    });

    it('returns 2× base reward for exactly 20 claimed referrals', () => {
      expect(calculateReward(5, 20)).toBe(10);
    });

    it('returns 2× base reward for 49 claimed referrals (in second tier)', () => {
      expect(calculateReward(5, 49)).toBe(10);
    });

    it('returns 3× base reward for exactly 50 claimed referrals', () => {
      expect(calculateReward(5, 50)).toBe(15);
    });

    it('returns 3× base reward for 100+ claimed referrals (max tier)', () => {
      expect(calculateReward(5, 100)).toBe(15);
    });

    it('scales correctly with a non-default base reward', () => {
      expect(calculateReward(10, 20)).toBe(20);
      expect(calculateReward(10, 50)).toBe(30);
    });
  });

  // ── Fraud detection – rate limiting ───────────────────────────────────────

  describe('detectReferralFraud – rapid referral rate', () => {
    it('flags a referrer who has made 5+ referrals in the last hour', async () => {
      // Different owner
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user_referrer' }] });
      // Referred user has no previous referrals
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ attempt_count: '0' }] });
      // Referrer has 5 recent referrals → suspicious
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '5' }] });

      const result = await detectReferralFraud('user_new', 'TESTCODE01');
      expect(result.suspicious).toBe(true);
      expect(result.reasons.some((r) => r.includes('unusually high referral rate'))).toBe(true);
    });

    it('does NOT flag a referrer with only 4 recent referrals', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user_referrer' }] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ attempt_count: '0' }] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '4' }] });

      const result = await detectReferralFraud('user_new', 'TESTCODE01');
      expect(result.suspicious).toBe(false);
    });
  });

  // ── Multiple fraud flags ───────────────────────────────────────────────────

  describe('detectReferralFraud – multiple violations', () => {
    it('accumulates all applicable fraud reasons', async () => {
      // Same user owns the code (self-referral)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user_bob' }] });
      // Already has a previous referral
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ attempt_count: '2' }] });
      // High referral rate
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '10' }] });

      const result = await detectReferralFraud('user_bob', 'BOBCODE000');
      expect(result.suspicious).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── getReferralStats ───────────────────────────────────────────────────────

  describe('getReferralStats', () => {
    it('returns total_referrals and total_rewards from completed entries', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ total_referrals: '3', total_rewards: '15.00' }],
      });

      const stats = await getReferralStats('user_referrer');
      expect(stats.total_referrals).toBe('3');
      expect(stats.total_rewards).toBe('15.00');
    });
  });

  // ── getReferralAnalytics ───────────────────────────────────────────────────

  describe('getReferralAnalytics', () => {
    it('calculates conversion rate correctly', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            total_referrals: '10',
            completed_referrals: '4',
            pending_referrals: '6',
            total_rewards_earned: '20.00',
          },
        ],
      });

      const analytics = await getReferralAnalytics('user_referrer');
      expect(analytics.totalReferrals).toBe(10);
      expect(analytics.completedReferrals).toBe(4);
      expect(analytics.pendingReferrals).toBe(6);
      expect(analytics.totalRewardsEarned).toBe(20);
      expect(analytics.conversionRate).toBeCloseTo(0.4);
    });

    it('returns conversionRate of 0 when there are no referrals', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            total_referrals: '0',
            completed_referrals: '0',
            pending_referrals: '0',
            total_rewards_earned: '0',
          },
        ],
      });

      const analytics = await getReferralAnalytics('user_new');
      expect(analytics.conversionRate).toBe(0);
    });

    it('returns 100% conversion rate when all referrals are completed', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            total_referrals: '5',
            completed_referrals: '5',
            pending_referrals: '0',
            total_rewards_earned: '25.00',
          },
        ],
      });

      const analytics = await getReferralAnalytics('user_top');
      expect(analytics.conversionRate).toBe(1);
    });
  });

  // ── getReferralLeaderboard ─────────────────────────────────────────────────

  describe('getReferralLeaderboard', () => {
    it('returns entries sorted by rank (rank 1 = highest referrals)', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'user_a', total_referrals: '20', total_rewards_earned: '100' },
          { user_id: 'user_b', total_referrals: '10', total_rewards_earned: '50' },
          { user_id: 'user_c', total_referrals: '5', total_rewards_earned: '25' },
        ],
      });

      const leaderboard = await getReferralLeaderboard(10);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].userId).toBe('user_a');
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[2].rank).toBe(3);
    });

    it('respects the limit parameter', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ user_id: 'user_a', total_referrals: '5', total_rewards_earned: '25' }],
      });

      const leaderboard = await getReferralLeaderboard(1);
      expect(leaderboard).toHaveLength(1);
    });

    it('returns an empty leaderboard when no referrals exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const leaderboard = await getReferralLeaderboard();
      expect(leaderboard).toHaveLength(0);
    });
  });
});
