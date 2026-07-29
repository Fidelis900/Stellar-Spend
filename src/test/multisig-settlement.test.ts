import { describe, it, expect, vi } from 'vitest';
import { MultisigSettlementService, type MultisigConfig } from '@/lib/multisig-settlement';

// Mock DB pool so tests don't need a real Postgres connection
vi.mock('@/lib/db/client', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

const SIGNERS = ['alice', 'bob', 'carol'];
const CONFIG: MultisigConfig = {
  threshold: 2,
  signers: SIGNERS,
  highValueLimit: BigInt(1000),
};

function makeService(cfg: Partial<MultisigConfig> = {}) {
  return new MultisigSettlementService({ ...CONFIG, ...cfg });
}

describe('MultisigSettlementService', () => {
  describe('constructor', () => {
    it('rejects threshold of 0', () => {
      expect(() => makeService({ threshold: 0 })).toThrow('Invalid threshold');
    });

    it('rejects threshold greater than signer count', () => {
      expect(() => makeService({ threshold: 4 })).toThrow('Invalid threshold');
    });

    it('accepts valid config', () => {
      expect(() => makeService()).not.toThrow();
    });
  });

  describe('requiredThreshold', () => {
    it('returns 1 for low-value transfers', () => {
      const svc = makeService();
      expect(svc.requiredThreshold(BigInt(500))).toBe(1);
    });

    it('returns full threshold for high-value transfers', () => {
      const svc = makeService();
      expect(svc.requiredThreshold(BigInt(5000))).toBe(CONFIG.threshold);
    });

    it('returns 1 when value equals limit (boundary: ≤ highValueLimit)', () => {
      const svc = makeService();
      expect(svc.requiredThreshold(BigInt(1000))).toBe(1);
    });

    it('returns full threshold when highValueLimit is 0 (always require quorum)', () => {
      const svc = makeService({ highValueLimit: BigInt(0) });
      expect(svc.requiredThreshold(BigInt(1))).toBe(CONFIG.threshold);
    });
  });

  describe('assertIsSigner (via propose)', () => {
    it('throws when proposer is not a registered signer', async () => {
      const svc = makeService();
      await expect(svc.propose('mallory', 'Test', '0xTarget', BigInt(100), 'sig')).rejects.toThrow(
        'not a registered signer',
      );
    });
  });

  describe('getProposalStatus', () => {
    it('reports not ready when below threshold', () => {
      const svc = makeService();
      const proposal = {
        id: 'p1',
        description: 'release',
        target: '0x1',
        value: BigInt(5000),
        signatures: [{ signer: 'alice', signature: 's1', signedAt: 1 }],
        executed: false,
        createdAt: 1,
        expiresAt: Date.now() + 10_000,
      };
      const status = svc.getProposalStatus(proposal);
      expect(status.ready).toBe(false);
      expect(status.collected).toBe(1);
      expect(status.required).toBe(2);
    });

    it('reports ready when threshold is met', () => {
      const svc = makeService();
      const proposal = {
        id: 'p2',
        description: 'release',
        target: '0x1',
        value: BigInt(5000),
        signatures: [
          { signer: 'alice', signature: 's1', signedAt: 1 },
          { signer: 'bob', signature: 's2', signedAt: 2 },
        ],
        executed: false,
        createdAt: 1,
        expiresAt: Date.now() + 10_000,
      };
      const status = svc.getProposalStatus(proposal);
      expect(status.ready).toBe(true);
      expect(status.collected).toBe(2);
    });
  });
});
