import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB client before importing the service
vi.mock('../db/client', () => ({
  db: {
    query: vi.fn(),
  },
  pool: {
    query: vi.fn(),
  },
}));

import { db } from '../db/client';

// Set dummy env var
process.env.DATABASE_URL = 'postgres://localhost:5432/dummy';

import {
  calculateRiskScore,
  calculateInsurancePremium,
  createInsurance,
  getInsuranceStatus,
  getInsuranceById,
  fileClaim,
  verifyClaim,
  approveClaim,
  rejectClaim,
  processInsurancePayout,
  getInsuranceAnalytics,
} from '../services/insurance.service';

describe('Insurance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Unit Tests: Risk & Premium Calculation', () => {
    it('should calculate risk score correctly for low value stablecoins', () => {
      // Base (50) + Low amount (<100: +10) - Stablecoin (USDC: -5) = 55
      expect(calculateRiskScore(50, 'USDC')).toBe(55);
    });

    it('should calculate risk score correctly for high value stablecoins', () => {
      // Base (50) - High amount (>10000: -10) - Stablecoin (USDC: -5) = 35
      expect(calculateRiskScore(20000, 'USDC')).toBe(35);
    });

    it('should calculate risk score correctly for medium value volatile currency', () => {
      // Base (50)
      expect(calculateRiskScore(500, 'NGN')).toBe(50);
    });

    it('should calculate insurance premium and quote for standard amounts', async () => {
      const quote = await calculateInsurancePremium(1000, 'USDC');
      expect(quote.provider).toBe('premium');
      expect(quote.coverage).toBe(1100); // 1.1x coverage
      expect(quote.premium).toBeGreaterThan(0);
      expect(quote.riskScore).toBe(45);
    });

    it('should apply bulk discount rate for high value policy quotes', async () => {
      const quote = await calculateInsurancePremium(20000, 'USDC');
      expect(quote.provider).toBe('enterprise');
      expect(quote.premium).toBe(58.2);
    });
  });

  describe('Integration Tests: Claim Eligibility & Workflow', () => {
    const mockTxId = 'tx-123-uuid';
    const mockInsuranceId = 'ins-456-uuid';

    // Scenario Fixtures
    const mockActivePolicyRow = {
      id: mockInsuranceId,
      transaction_id: mockTxId,
      provider: 'premium',
      premium_amount: 15.0,
      coverage_amount: 1100.0,
      status: 'active',
    };

    const mockClaimedPolicyRow = {
      id: mockInsuranceId,
      transaction_id: mockTxId,
      status: 'claimed',
      claim_id: 'CLAIM-1001',
      claim_reason: 'Transaction unconfirmed on chain after 24h',
      amount: 1000,
      tx_status: 'failed',
    };

    it('should create insurance record in pending/active state', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [{ ...mockActivePolicyRow }],
      });

      const res = await createInsurance(mockTxId, 15.0, 1100.0, 'premium');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transaction_insurance'),
        [mockTxId, 15.0, 1100.0, 'premium'],
      );
      expect((res as any).rows[0].status).toBe('active');
    });

    it('should file claim successfully on existing insurance policy fixture', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [{ ...mockActivePolicyRow, status: 'claimed', claim_id: 'CLAIM-1001' }],
      });

      const result = await fileClaim(mockInsuranceId, 'Transaction lost', 'tx_hash_proof');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE transaction_insurance SET status = 'claimed'"),
        expect.arrayContaining([
          expect.stringMatching(/^CLAIM-/),
          'Transaction lost',
          'tx_hash_proof',
          mockInsuranceId,
        ]),
      );
      expect((result as any).rows[0].status).toBe('claimed');
    });

    it('should verify claim eligibility correctly for valid claims', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [mockClaimedPolicyRow],
      });

      const verification = await verifyClaim(mockInsuranceId);
      expect(verification.valid).toBe(true);
    });

    it('should fail claim verification if policy is not in claimed status', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [mockActivePolicyRow],
      });

      const verification = await verifyClaim(mockInsuranceId);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('No active claim on this policy');
    });

    it('should fail claim verification if claim is missing stated reason', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [{ ...mockClaimedPolicyRow, claim_reason: null }],
      });

      const verification = await verifyClaim(mockInsuranceId);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('Claim has no stated reason');
    });

    it('should approve verified claim successfully', async () => {
      // Mock verifyClaim lookup
      (db.query as any)
        .mockResolvedValueOnce({ rows: [mockClaimedPolicyRow] }) // verifyClaim
        .mockResolvedValueOnce({ rows: [{ ...mockClaimedPolicyRow, status: 'claim_approved' }] }); // approveClaim UPDATE

      const res = await approveClaim(mockInsuranceId);
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining("SET status = 'claim_approved'"),
        [mockInsuranceId],
      );
      expect((res as any).rows[0].status).toBe('claim_approved');
    });

    it('should reject claim with specific rejection reason', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            ...mockClaimedPolicyRow,
            status: 'claim_rejected',
            rejection_reason: 'Insufficient evidence',
          },
        ],
      });

      const res = await rejectClaim(mockInsuranceId, 'Insufficient evidence');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'claim_rejected'"),
        ['Insufficient evidence', mockInsuranceId],
      );
      expect((res as any).rows[0].rejection_reason).toBe('Insufficient evidence');
    });

    it('should process insurance payout for approved claims', async () => {
      const approvedRow = { ...mockClaimedPolicyRow, status: 'claim_approved' };
      (db.query as any)
        .mockResolvedValueOnce({ rows: [approvedRow] }) // get insurance record
        .mockResolvedValueOnce({
          rows: [{ ...approvedRow, status: 'paid', payout_reference: 'PAY-123' }],
        }); // payout UPDATE

      const res = await processInsurancePayout(mockInsuranceId);
      expect((res as any).rows[0].status).toBe('paid');
    });

    it('should throw error if attempting payout on unapproved claim', async () => {
      (db.query as any).mockResolvedValueOnce({ rows: [mockClaimedPolicyRow] });

      await expect(processInsurancePayout(mockInsuranceId)).rejects.toThrow(
        'Claim must be approved before payout',
      );
    });

    it('should aggregate insurance analytics correctly', async () => {
      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            total_policies: 10,
            active_policies: 7,
            total_premiums: 150.0,
            total_paid: 500.0,
            total_claims: 2,
          },
        ],
      });

      const analytics = await getInsuranceAnalytics();
      expect(analytics.totalPolicies).toBe(10);
      expect(analytics.activePolicies).toBe(7);
      expect(analytics.totalPremiumsCollected).toBe(150.0);
      expect(analytics.totalClaimsPaid).toBe(500.0);
      expect(analytics.claimRate).toBe(0.2);
    });
  });
});
