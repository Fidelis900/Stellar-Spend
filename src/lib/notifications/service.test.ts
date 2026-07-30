import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@/lib/transaction-storage';

vi.mock('@/lib/notifications/preferences-store', () => ({
  getNotificationPreferences: vi.fn(),
  upsertNotificationPreferences: vi.fn(),
}));

vi.mock('@/lib/notifications/delivery-store', () => ({
  createNotificationDelivery: vi.fn(),
  retryNotificationDelivery: vi.fn(),
  getNotificationDeliveriesForTransaction: vi.fn(),
}));

import { notifyTransactionStatusUpdate } from '@/lib/notifications';
import type { ChannelAdapter } from '@/lib/notifications';
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/notifications';
import {
  createNotificationDelivery,
  retryNotificationDelivery,
} from '@/lib/notifications';

const getPrefsMock = vi.mocked(getNotificationPreferences);
const createDeliveryMock = vi.mocked(createNotificationDelivery);

const baseTransaction: Transaction = {
  id: 'tx_notify_1',
  timestamp: Date.now(),
  userAddress: 'GUSER123',
  amount: '75',
  currency: 'NGN',
  status: 'completed',
  beneficiary: {
    institution: 'ACCESS',
    accountIdentifier: '1234567890',
    accountName: 'Jane Doe',
    currency: 'NGN',
  },
};

describe('notifyTransactionStatusUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrefsMock.mockResolvedValue({
      userAddress: 'GUSER123',
      email: 'user@example.com',
      phoneNumber: '+2348000000000',
      pushToken: undefined,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
      notifyOnPending: true,
      notifyOnCompleted: true,
      notifyOnFailed: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    createDeliveryMock.mockResolvedValue({ id: 'delivery-1' } as any);
    vi.mocked(retryNotificationDelivery).mockResolvedValue(undefined);
  });

  it('delivers to email and skips SMS/push when only emailEnabled', async () => {
    const emailSend = vi.fn().mockResolvedValue({ status: 'sent', providerMessageId: 'email-1' });
    const emailAdapter: ChannelAdapter = { channel: 'email', send: emailSend };
    const smsSend = vi.fn().mockResolvedValue({ status: 'sent' });
    const smsAdapter: ChannelAdapter = { channel: 'sms', send: smsSend };

    await notifyTransactionStatusUpdate(
      { transaction: baseTransaction, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter, smsAdapter],
    );

    expect(emailSend).toHaveBeenCalledOnce();
    expect(smsSend).not.toHaveBeenCalled();
    expect(createDeliveryMock).toHaveBeenCalledOnce();
    expect(createDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'sent', providerMessageId: 'email-1' }),
    );
  });

  it('does not send anything when the event is unchanged', async () => {
    const emailAdapter: ChannelAdapter = {
      channel: 'email',
      send: vi.fn().mockResolvedValue({ status: 'sent' }),
    };

    await notifyTransactionStatusUpdate(
      {
        transaction: { ...baseTransaction, status: 'completed' },
        previousStatus: 'completed',
        previousPayoutStatus: undefined,
        source: 'manual_update',
      },
      [emailAdapter],
    );

    expect(createDeliveryMock).not.toHaveBeenCalled();
  });
});
