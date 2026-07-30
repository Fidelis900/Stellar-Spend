import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRefundEligible, calculateRefundAmount, processRefund } from './refund-service';
import type { Transaction } from '@/lib/transaction-storage';

vi.mock('@/lib/db/dal', () => ({
  dal: {
    getById: vi.fn(),
    update: vi.fn(),
  },
  DatabaseError: class DatabaseError extends Error {},
}));

vi.mock('@/lib/notifications/service', () => ({
  notifyTransactionStatusUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { dal } from '@/lib/db';

const baseTx: Transaction = {
  id: 'tx_1',
  timestamp: Date.now(),
  userAddress: '0xabc',
  amount: '100',
  currency: 'NGN',
  status: 'failed',
  beneficiary: {
    institution: 'GTB',
    accountIdentifier: '1234567890',
    accountName: 'John',
    currency: 'NGN',
  },
};

describe('isRefundEligible', () => {
  it('returns true for failed transactions', () => {
    expect(isRefundEligible({ ...baseTx, status: 'failed' })).toBe(true);
  });

  it('returns true for expired payout status', () => {
    expect(isRefundEligible({ ...baseTx, status: 'pending', payoutStatus: 'expired' })).toBe(true);
  });

  it('returns false for completed transactions', () => {
    expect(isRefundEligible({ ...baseTx, status: 'completed' })).toBe(false);
  });

  it('returns false for pending transactions without expired payout', () => {
    expect(isRefundEligible({ ...baseTx, status: 'pending', payoutStatus: 'pending' })).toBe(false);
  });
});

describe('calculateRefundAmount', () => {
  it('returns full amount for non-partial refund', () => {
    expect(calculateRefundAmount(baseTx, false)).toBe('100');
  });

  it('returns 99.5% for partial refund', () => {
    const result = parseFloat(calculateRefundAmount(baseTx, true));
    expect(result).toBeCloseTo(99.5, 4);
  });
});

describe('processRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error if transaction not found', async () => {
    vi.mocked(dal.getById).mockResolvedValue(null);
    const result = await processRefund('tx_missing', 'manual');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error if transaction not eligible', async () => {
    vi.mocked(dal.getById).mockResolvedValue({ ...baseTx, status: 'completed' });
    const result = await processRefund('tx_1', 'manual');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not eligible/i);
  });

  it('processes refund successfully', async () => {
    vi.mocked(dal.getById).mockResolvedValue(baseTx);
    vi.mocked(dal.update).mockResolvedValue(undefined);
    const result = await processRefund('tx_1', 'payment_failed');
    expect(result.success).toBe(true);
    expect(result.refundAmount).toBe('100');
    expect(dal.update).toHaveBeenCalledWith(
      'tx_1',
      expect.objectContaining({ payoutStatus: 'refunded' }),
    );
  });
});
