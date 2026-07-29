import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/lib/transaction-storage';
import { buildNotificationTemplate, deriveNotificationEvent } from '@/lib/notifications/templates';

const baseTransaction: Transaction = {
  id: 'tx_1',
  timestamp: Date.now(),
  userAddress: 'GUSER123',
  amount: '100',
  currency: 'NGN',
  status: 'pending',
  beneficiary: {
    institution: 'ACCESS',
    accountIdentifier: '1234567890',
    accountName: 'Jane Doe',
    currency: 'NGN',
  },
};

describe('deriveNotificationEvent', () => {
  it('returns completed when status transitions to completed', () => {
    expect(
      deriveNotificationEvent({
        transaction: { ...baseTransaction, status: 'completed' },
        previousStatus: 'pending',
        source: 'webhook',
      }),
    ).toBe('completed');
  });

  it('returns failed when status transitions to failed', () => {
    expect(
      deriveNotificationEvent({
        transaction: { ...baseTransaction, status: 'failed', error: 'Order expired' },
        previousStatus: 'pending',
        source: 'webhook',
      }),
    ).toBe('failed');
  });

  it('returns pending when payout status changes to pending', () => {
    expect(
      deriveNotificationEvent({
        transaction: { ...baseTransaction, payoutStatus: 'pending' },
        previousStatus: 'pending',
        previousPayoutStatus: undefined,
        source: 'webhook',
      }),
    ).toBe('pending');
  });
});

describe('buildNotificationTemplate', () => {
  it('builds a completion template', () => {
    const template = buildNotificationTemplate({
      transaction: { ...baseTransaction, status: 'completed' },
      previousStatus: 'pending',
      source: 'webhook',
    });

    expect(template?.templateId).toBe('transaction-completed-v1');
    expect(template?.subject).toMatch(/completed/i);
    expect(template?.message).toContain('settled successfully');
  });

  it('builds a failure template with the transaction error', () => {
    const template = buildNotificationTemplate({
      transaction: { ...baseTransaction, status: 'failed', error: 'Refunded by Paycrest' },
      previousStatus: 'pending',
      source: 'refund',
    });

    expect(template?.templateId).toBe('transaction-failed-v1');
    expect(template?.message).toContain('Refunded by Paycrest');
  });
});
