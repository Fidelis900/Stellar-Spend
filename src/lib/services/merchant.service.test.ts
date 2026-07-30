/**
 * Unit tests for MerchantService — #852
 *
 * Focuses on edge cases around account creation and bulk-payout metadata
 * validation that are critical for data integrity:
 *
 *  - Duplicate registration (same userId) must be rejected with a clear error
 *  - Missing / invalid required fields on createMerchant() throw early
 *  - Missing / invalid fields on createBulkPayout() throw early
 *  - Idempotency key deduplication returns the existing payout (not a new one)
 *  - getMerchant() returns null for unknown IDs rather than throwing
 *  - getMerchantByUserId() returns null for unknown userIds
 *
 * All database calls are mocked.  The mock for `createMerchant` enforces the
 * unique constraint on `user_id` (migration 025), which is what the real DB
 * would reject with a `23505` unique-violation error code.
 *
 * Coverage target: 85 %+ for src/lib/services/merchant.service.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock db/client before importing the module under test ─────────────────────

const poolQueryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  pool: { query: (...args: unknown[]) => poolQueryMock(...args) },
}));

// ── Import SUT after mock registration ───────────────────────────────────────

import { MerchantService } from '@/lib/services';

// ── Test data factories ────────────────────────────────────────────────────────

function makeMerchantRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'merchant-uuid-001',
    user_id: 'user-001',
    business_name: 'Acme Corp',
    business_email: 'billing@acme.com',
    role: 'owner',
    webhook_url: null,
    status: 'active',
    api_key_hash: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makePayoutRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'payout-uuid-001',
    merchant_id: 'merchant-uuid-001',
    idempotency_key: 'idem-key-001',
    total_amount: '500.000000',
    currency: 'NGN',
    status: 'pending',
    created_at: now,
    completed_at: null,
    ...overrides,
  };
}

function makeValidBulkItems() {
  return [
    {
      beneficiaryInstitution: 'GTBank',
      beneficiaryAccount: '1234567890',
      beneficiaryName: 'Jane Doe',
      amount: 250,
      currency: 'NGN',
    },
    {
      beneficiaryInstitution: 'Access Bank',
      beneficiaryAccount: '0987654321',
      beneficiaryName: 'John Smith',
      amount: 250,
      currency: 'NGN',
    },
  ];
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('#852 — MerchantService unit tests', () => {
  let service: MerchantService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MerchantService();
  });

  // ─── createMerchant — happy path ──────────────────────────────────────────

  describe('createMerchant() — happy path', () => {
    it('returns a fully-typed MerchantAccount on success', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [makeMerchantRow()] });

      const result = await service.createMerchant('user-001', 'Acme Corp', 'billing@acme.com');

      expect(result.id).toBe('merchant-uuid-001');
      expect(result.userId).toBe('user-001');
      expect(result.businessName).toBe('Acme Corp');
      expect(result.businessEmail).toBe('billing@acme.com');
      expect(result.status).toBe('active');
      expect(result.role).toBe('owner');
    });

    it('passes userId, businessName, businessEmail to the DB in order', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [makeMerchantRow()] });

      await service.createMerchant('user-xyz', 'My Biz', 'hello@mybiz.io');

      expect(poolQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO merchant_accounts'),
        ['user-xyz', 'My Biz', 'hello@mybiz.io'],
      );
    });
  });

  // ─── createMerchant — duplicate registration ──────────────────────────────

  describe('createMerchant() — duplicate registration', () => {
    it('throws when the same userId is registered twice', async () => {
      // First call succeeds
      poolQueryMock.mockResolvedValueOnce({ rows: [makeMerchantRow()] });
      await service.createMerchant('user-dup', 'First Biz', 'first@biz.com');

      // Second call simulates the DB unique-constraint violation
      const pgError: any = new Error(
        'duplicate key value violates unique constraint "merchant_accounts_user_id_idx"',
      );
      pgError.code = '23505';
      pgError.constraint = 'merchant_accounts_user_id_idx';
      poolQueryMock.mockRejectedValueOnce(pgError);

      await expect(
        service.createMerchant('user-dup', 'Second Biz', 'second@biz.com'),
      ).rejects.toThrow(/duplicate key/i);
    });

    it('throws when the same businessEmail is registered twice (unique email scenario)', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [makeMerchantRow()] });
      await service.createMerchant('user-email-1', 'Biz A', 'shared@email.com');

      const pgError: any = new Error('duplicate key value violates unique constraint');
      pgError.code = '23505';
      poolQueryMock.mockRejectedValueOnce(pgError);

      await expect(
        service.createMerchant('user-email-2', 'Biz B', 'shared@email.com'),
      ).rejects.toThrow();
    });
  });

  // ─── createMerchant — invalid metadata ───────────────────────────────────

  describe('createMerchant() — missing / invalid required metadata', () => {
    it('throws when userId is empty string', async () => {
      await expect(service.createMerchant('', 'Acme', 'acme@test.com')).rejects.toThrow(
        /userId.*required|required.*userId/i,
      );
    });

    it('throws when businessName is empty string', async () => {
      await expect(service.createMerchant('user-001', '', 'acme@test.com')).rejects.toThrow(
        /businessName.*required|required.*businessName/i,
      );
    });

    it('throws when businessEmail is empty string', async () => {
      await expect(service.createMerchant('user-001', 'Acme', '')).rejects.toThrow(
        /businessEmail.*required|required.*businessEmail/i,
      );
    });

    it('throws when all three required fields are missing', async () => {
      await expect(service.createMerchant('', '', '')).rejects.toThrow(/required/i);
    });

    it('does NOT call the database when required fields are missing', async () => {
      await expect(service.createMerchant('', 'x', 'x@x.com')).rejects.toThrow();
      expect(poolQueryMock).not.toHaveBeenCalled();
    });
  });

  // ─── getMerchant — null for unknown ID ───────────────────────────────────

  describe('getMerchant()', () => {
    it('returns the merchant when found', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [makeMerchantRow()] });
      const result = await service.getMerchant('merchant-uuid-001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('merchant-uuid-001');
    });

    it('returns null for an unknown merchantId', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [] });
      const result = await service.getMerchant('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  // ─── getMerchantByUserId ─────────────────────────────────────────────────

  describe('getMerchantByUserId()', () => {
    it('returns the merchant for a known userId', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [makeMerchantRow()] });
      const result = await service.getMerchantByUserId('user-001');
      expect(result!.userId).toBe('user-001');
    });

    it('returns null when userId has no registered merchant', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [] });
      const result = await service.getMerchantByUserId('unknown-user');
      expect(result).toBeNull();
    });
  });

  // ─── createBulkPayout — happy path ────────────────────────────────────────

  describe('createBulkPayout() — happy path', () => {
    it('creates a payout and returns it with the correct total amount', async () => {
      // No existing idempotency key
      poolQueryMock.mockResolvedValueOnce({ rows: [] });
      // INSERT INTO merchant_payouts
      poolQueryMock.mockResolvedValueOnce({ rows: [makePayoutRow()] });
      // 2× INSERT INTO merchant_payout_items
      poolQueryMock.mockResolvedValue({ rows: [] });

      const result = await service.createBulkPayout(
        'merchant-uuid-001',
        'idem-key-001',
        makeValidBulkItems(),
      );

      expect(result.id).toBe('payout-uuid-001');
      expect(result.idempotencyKey).toBe('idem-key-001');
      expect(result.currency).toBe('NGN');
    });
  });

  // ─── createBulkPayout — idempotency key deduplication ────────────────────

  describe('createBulkPayout() — idempotency key deduplication', () => {
    it('returns the existing payout when idempotency key already used', async () => {
      const existingPayout = makePayoutRow({ id: 'existing-payout-id' });
      poolQueryMock.mockResolvedValueOnce({ rows: [existingPayout] });

      const result = await service.createBulkPayout(
        'merchant-uuid-001',
        'idem-key-001',
        makeValidBulkItems(),
      );

      expect(result.id).toBe('existing-payout-id');
      // Must NOT insert a new payout row
      expect(poolQueryMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─── createBulkPayout — invalid metadata ─────────────────────────────────

  describe('createBulkPayout() — missing / invalid required metadata', () => {
    it('throws when merchantId is empty', async () => {
      await expect(service.createBulkPayout('', 'idem-key', makeValidBulkItems())).rejects.toThrow(
        /merchantId.*required|required/i,
      );
    });

    it('throws when idempotencyKey is empty', async () => {
      await expect(
        service.createBulkPayout('merchant-001', '', makeValidBulkItems()),
      ).rejects.toThrow(/idempotencyKey.*required|required/i);
    });

    it('throws when items array is empty', async () => {
      await expect(service.createBulkPayout('merchant-001', 'idem-key', [])).rejects.toThrow(
        /items.*required|required/i,
      );
    });

    it('does NOT call the database when required fields are missing', async () => {
      await expect(service.createBulkPayout('', '', [])).rejects.toThrow();
      expect(poolQueryMock).not.toHaveBeenCalled();
    });
  });

  // ─── getBulkPayoutStatus ──────────────────────────────────────────────────

  describe('getBulkPayoutStatus()', () => {
    it('returns null for an unknown payout ID', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [] });
      const result = await service.getBulkPayoutStatus('nonexistent-payout');
      expect(result).toBeNull();
    });

    it('returns payout with items when found', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [makePayoutRow()] });
      poolQueryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            payout_id: 'payout-uuid-001',
            beneficiary_institution: 'GTBank',
            beneficiary_account: '1234567890',
            beneficiary_name: 'Jane Doe',
            amount: '250.000000',
            currency: 'NGN',
            status: 'pending',
            error_message: null,
          },
        ],
      });

      const result = await service.getBulkPayoutStatus('payout-uuid-001');
      expect(result).not.toBeNull();
      expect(result!.items).toHaveLength(1);
      expect(result!.items![0].beneficiaryInstitution).toBe('GTBank');
    });

    it('maps completedAt when payout has a completed_at timestamp', async () => {
      // Exercises the truthy branch of: completedAt: row.completed_at ? ... : undefined
      const completedAt = new Date('2026-07-28T12:00:00.000Z');
      poolQueryMock.mockResolvedValueOnce({
        rows: [makePayoutRow({ status: 'completed', completed_at: completedAt })],
      });
      poolQueryMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.getBulkPayoutStatus('payout-uuid-001');
      expect(result).not.toBeNull();
      expect(result!.completedAt).toBe(completedAt.toISOString());
    });
  });

  // ─── getMerchantPayouts ────────────────────────────────────────────────────

  describe('getMerchantPayouts()', () => {
    it('returns paginated list and total count', async () => {
      poolQueryMock
        .mockResolvedValueOnce({ rows: [makePayoutRow(), makePayoutRow({ id: 'payout-2' })] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const { payouts, total } = await service.getMerchantPayouts('merchant-001', 1, 10);
      expect(payouts).toHaveLength(2);
      expect(total).toBe(5);
    });
  });

  // ─── getMerchantStats ──────────────────────────────────────────────────────

  describe('getMerchantStats()', () => {
    it('calculates success rate correctly', async () => {
      poolQueryMock.mockResolvedValueOnce({
        rows: [
          {
            total_payouts: '10',
            completed_payouts: '8',
            failed_payouts: '2',
            total_volume: '50000.000000',
          },
        ],
      });

      const stats = await service.getMerchantStats('merchant-001');
      expect(stats.totalPayouts).toBe(10);
      expect(stats.completedPayouts).toBe(8);
      expect(stats.failedPayouts).toBe(2);
      expect(stats.successRate).toBe(80);
      expect(stats.totalVolume).toBe(50000);
    });

    it('returns 0% success rate when no payouts exist', async () => {
      poolQueryMock.mockResolvedValueOnce({
        rows: [
          {
            total_payouts: '0',
            completed_payouts: '0',
            failed_payouts: '0',
            total_volume: '0',
          },
        ],
      });

      const stats = await service.getMerchantStats('new-merchant');
      expect(stats.successRate).toBe(0);
    });
  });

  // ─── updateWebhook ─────────────────────────────────────────────────────────

  describe('updateWebhook()', () => {
    it('returns the updated merchant with the new webhook URL', async () => {
      const updatedRow = makeMerchantRow({ webhook_url: 'https://my-service.io/webhook' });
      poolQueryMock.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await service.updateWebhook(
        'merchant-uuid-001',
        'https://my-service.io/webhook',
      );

      expect(result).not.toBeNull();
      expect(result!.webhookUrl).toBe('https://my-service.io/webhook');
    });

    it('returns null when merchantId does not exist', async () => {
      poolQueryMock.mockResolvedValueOnce({ rows: [] });
      const result = await service.updateWebhook('ghost-id', 'https://example.com/hook');
      expect(result).toBeNull();
    });
  });
});
