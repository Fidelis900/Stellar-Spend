import { describe, it, expect, beforeEach } from 'vitest';
import { KYCLimitService, type LimitTier } from '@/lib/kyc-limits';
import {
  SandboxKycProvider,
  VERIFICATION_LEVEL_MAP,
  getRequiredVerificationLevel,
  type VerificationLevel,
} from '@/lib/kyc-provider';

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
}

describe('KYC Tier Enforcement', () => {
  const userId = 'test_user_123';

  beforeEach(() => {
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).window = {};
      (globalThis as any).localStorage = createLocalStorageMock();
    }
    // Start fresh
    KYCLimitService.initializeUserLimits(userId, 'tier1');
  });

  describe('Tier limits', () => {
    it('tier1 allows small transactions', () => {
      const result = KYCLimitService.canTransact(userId, 100);
      expect(result.allowed).toBe(true);
    });

    it('tier1 blocks transactions above transaction limit', () => {
      const result = KYCLimitService.canTransact(userId, 600);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Transaction exceeds limit');
    });

    it('tier1 blocks transactions that exceed daily limit', () => {
      KYCLimitService.recordTransaction(userId, 600);
      const result = KYCLimitService.canTransact(userId, 500);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit exceeded');
    });

    it('tier2 allows medium transactions after KYC verification', () => {
      KYCLimitService.submitKYC(userId, 'passport', 'PP123456');
      KYCLimitService.verifyKYC(userId);
      const result = KYCLimitService.canTransact(userId, 2000);
      expect(result.allowed).toBe(true);
    });

    it('tier2 blocks transactions above its limit', () => {
      KYCLimitService.submitKYC(userId, 'passport', 'PP123456');
      KYCLimitService.verifyKYC(userId);
      const result = KYCLimitService.canTransact(userId, 10000);
      expect(result.allowed).toBe(false);
    });

    it('unverified user cannot transact', () => {
      const newUser = 'unverified_user';
      KYCLimitService.initializeUserLimits(newUser, 'tier1');
      const result = KYCLimitService.canTransact(newUser, 50);
      expect(result.allowed).toBe(true);
    });

    it('respects corridor-specific overrides when provided', () => {
      // NGN corridor overrides tier2 to 5000 tx limit
      KYCLimitService.submitKYC(userId, 'passport', 'PP123456');
      KYCLimitService.verifyKYC(userId);
      // With NGN override tier2 = 5k, 4500 should be fine
      const result = KYCLimitService.canTransact(userId, 4500, 'NGN');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Limit increase requests', () => {
    it('can request a tier increase', () => {
      const request = KYCLimitService.requestLimitIncrease(userId, 'tier2');
      expect(request.status).toBe('pending');
      expect(request.requestedTier).toBe('tier2');
    });

    it('can approve a limit increase', () => {
      const request = KYCLimitService.requestLimitIncrease(userId, 'tier2');
      const approved = KYCLimitService.approveLimitIncrease(userId, request.id);
      expect(approved).toBe(true);

      const limits = KYCLimitService.getUserLimits(userId);
      expect(limits?.tier).toBe('tier2');
    });

    it('records audit event on limit increase', () => {
      const request = KYCLimitService.requestLimitIncrease(userId, 'tier2');
      const trail = KYCLimitService.getAuditTrail(userId);
      const event = trail.find((e) => e.eventType === 'limit_increase_requested');
      expect(event).toBeDefined();
      expect(event?.details).toEqual({ requestedTier: 'tier2' });

      KYCLimitService.approveLimitIncrease(userId, request.id);
      const approveEvent = KYCLimitService.getAuditTrail(userId).find(
        (e) => e.eventType === 'limit_increase_approved',
      );
      expect(approveEvent).toBeDefined();
    });
  });

  describe('Verification state and audit trail', () => {
    it('records audit events on KYC lifecycle', () => {
      KYCLimitService.submitKYC(userId, 'passport', 'PP123456');
      KYCLimitService.verifyKYC(userId);

      const trail = KYCLimitService.getAuditTrail(userId);
      expect(trail).toHaveLength(2);
      expect(trail[0].eventType).toBe('kyc_submitted');
      expect(trail[1].eventType).toBe('kyc_verified');
    });

    it('records rejection audit event', () => {
      KYCLimitService.submitKYC(userId, 'passport', 'PP123456');
      KYCLimitService.rejectKYC(userId, 'Document illegible');

      const trail = KYCLimitService.getAuditTrail(userId);
      const rejection = trail.find((e) => e.eventType === 'kyc_rejected');
      expect(rejection).toBeDefined();
      expect(rejection?.details?.reason).toBe('Document illegible');
    });
  });

  describe('Re-verification triggers', () => {
    it('does not require re-verification for recent KYC', () => {
      KYCLimitService.submitKYC(userId, 'passport', 'PP123456');
      KYCLimitService.verifyKYC(userId);
      const result = KYCLimitService.checkReverificationNeeded(userId);
      expect(result.needed).toBe(false);
    });

    it('triggers re-verification on request', () => {
      KYCLimitService.triggerReverification(userId, 'Manual ops review');
      const trail = KYCLimitService.getAuditTrail(userId);
      const trigger = trail.find((e) => e.eventType === 'reverification_triggered');
      expect(trigger).toBeDefined();
      expect(trigger?.details?.reason).toBe('Manual ops review');
    });
  });

  describe('KycProvider sandbox adapter', () => {
    it('submits verification and returns a verification ID', async () => {
      const provider = new SandboxKycProvider();
      const result = await provider.submitVerification(userId, 'advanced', {
        fullName: 'Test User',
        documentNumber: 'PP123456',
      });
      expect(result.success).toBe(true);
      expect(result.verificationId).toContain(userId);
    });

    it('checkStatus returns the correct level', async () => {
      const provider = new SandboxKycProvider();
      const { verificationId } = await provider.submitVerification(userId, 'advanced', {});
      const status = await provider.checkStatus(verificationId);
      expect(status.verified).toBe(true);
      expect(status.level).toBe('advanced');
      expect(status.providerName).toBe('sandbox');
    });

    it('maps verification levels to tiers', () => {
      expect(VERIFICATION_LEVEL_MAP.basic.tier).toBe('tier1');
      expect(VERIFICATION_LEVEL_MAP.advanced.tier).toBe('tier2');
      expect(VERIFICATION_LEVEL_MAP.enhanced.tier).toBe('tier3');
    });

    it('getRequiredVerificationLevel returns correct level', () => {
      expect(getRequiredVerificationLevel(null, 'tier1')).toBe('basic');
      expect(getRequiredVerificationLevel(null, 'tier2')).toBe('advanced');
      expect(getRequiredVerificationLevel(null, 'tier3')).toBe('enhanced');
    });
  });

  describe('Multi-transaction daily limit tracking', () => {
    it('accumulates daily usage across multiple transactions', () => {
      KYCLimitService.recordTransaction(userId, 300);
      KYCLimitService.recordTransaction(userId, 300);
      // 600 used, tier1 has 1000 daily limit
      const result = KYCLimitService.canTransact(userId, 300);
      expect(result.allowed).toBe(true);
    });

    it('blocks when accumulated usage exceeds daily limit', () => {
      KYCLimitService.recordTransaction(userId, 400);
      KYCLimitService.recordTransaction(userId, 400);
      KYCLimitService.recordTransaction(userId, 400);
      // 1200 used, tier1 has 1000 daily limit
      const result = KYCLimitService.canTransact(userId, 100);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit exceeded');
    });
  });
});
