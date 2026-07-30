import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import type {
  ChannelAdapter,
  DeliveryResult,
  NotificationPreferences,
} from '@/lib/notifications';
import { getNotificationPreferences } from '@/lib/notifications';
import {
  createNotificationDelivery,
  retryNotificationDelivery,
} from '@/lib/notifications';

const getPrefsMock = vi.mocked(getNotificationPreferences);
const createDeliveryMock = vi.mocked(createNotificationDelivery);
const retryDeliveryMock = vi.mocked(retryNotificationDelivery);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseTx: Transaction = {
  id: 'tx_dispatch_1',
  timestamp: Date.now(),
  userAddress: 'GUSER123',
  amount: '50',
  currency: 'NGN',
  status: 'completed',
  beneficiary: {
    institution: 'ACCESS',
    accountIdentifier: '1234567890',
    accountName: 'Jane Doe',
    currency: 'NGN',
  },
};

function makePrefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    userAddress: 'GUSER123',
    email: 'user@example.com',
    phoneNumber: '+2348000000000',
    pushToken: 'push-token-abc',
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: false,
    notifyOnPending: true,
    notifyOnCompleted: true,
    notifyOnFailed: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeAdapter(channel: 'email' | 'sms' | 'push', result: DeliveryResult): ChannelAdapter {
  return { channel, send: vi.fn().mockResolvedValue(result) };
}

function setupPrefs(prefs: NotificationPreferences) {
  getPrefsMock.mockResolvedValue(prefs);
  createDeliveryMock.mockResolvedValue({ id: 'delivery-1' } as any);
  retryDeliveryMock.mockResolvedValue(undefined);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dispatcher routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fans out only to email when only emailEnabled is true', async () => {
    setupPrefs(makePrefs({ smsEnabled: false, pushEnabled: false }));
    const emailAdapter = makeAdapter('email', { status: 'sent', providerMessageId: 'e1' });
    const smsAdapter = makeAdapter('sms', { status: 'sent' });
    const pushAdapter = makeAdapter('push', { status: 'sent' });

    await notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter, smsAdapter, pushAdapter],
    );

    expect(emailAdapter.send).toHaveBeenCalledOnce();
    expect(smsAdapter.send).not.toHaveBeenCalled();
    expect(pushAdapter.send).not.toHaveBeenCalled();
    expect(createDeliveryMock).toHaveBeenCalledOnce();
    expect(createDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'sent' }),
    );
  });

  it('fans out to all three channels when all are enabled', async () => {
    setupPrefs(makePrefs({ emailEnabled: true, smsEnabled: true, pushEnabled: true }));
    const adapters = [
      makeAdapter('email', { status: 'sent' }),
      makeAdapter('sms', { status: 'sent' }),
      makeAdapter('push', { status: 'sent' }),
    ];

    await notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      adapters,
    );

    for (const a of adapters) expect(a.send).toHaveBeenCalledOnce();
    expect(createDeliveryMock).toHaveBeenCalledTimes(3);
  });

  it('honours per-event channelRouting override', async () => {
    setupPrefs(
      makePrefs({
        emailEnabled: true,
        smsEnabled: true,
        pushEnabled: true,
        channelRouting: { completed: ['push'] },
      }),
    );
    const emailAdapter = makeAdapter('email', { status: 'sent' });
    const pushAdapter = makeAdapter('push', { status: 'sent' });

    await notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter, pushAdapter],
    );

    expect(emailAdapter.send).not.toHaveBeenCalled();
    expect(pushAdapter.send).toHaveBeenCalledOnce();
  });

  it('skips all channels when notifyOnCompleted is false', async () => {
    setupPrefs(makePrefs({ notifyOnCompleted: false }));
    const emailAdapter = makeAdapter('email', { status: 'sent' });

    await notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter],
    );

    expect(emailAdapter.send).not.toHaveBeenCalled();
    expect(createDeliveryMock).not.toHaveBeenCalled();
  });

  it('does nothing when the event is unchanged', async () => {
    setupPrefs(makePrefs());
    const emailAdapter = makeAdapter('email', { status: 'sent' });

    await notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'completed', source: 'webhook' },
      [emailAdapter],
    );

    expect(emailAdapter.send).not.toHaveBeenCalled();
    expect(createDeliveryMock).not.toHaveBeenCalled();
  });

  it('records a skipped delivery when adapter is missing for a routed channel', async () => {
    setupPrefs(makePrefs({ channelRouting: { completed: ['sms'] } }));

    await notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [], // no adapters
    );

    expect(createDeliveryMock).toHaveBeenCalledOnce();
    expect(createDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', status: 'skipped' }),
    );
  });
});

describe('retry logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a failed delivery and logs each attempt', async () => {
    setupPrefs(makePrefs({ smsEnabled: false, pushEnabled: false }));

    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'timeout' })
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'timeout' })
      .mockResolvedValueOnce({ status: 'sent', providerMessageId: 'ok' });

    const emailAdapter: ChannelAdapter = { channel: 'email', send: sendMock };

    const dispatchPromise = notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter],
    );

    await vi.runAllTimersAsync();
    await dispatchPromise;

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(createDeliveryMock).toHaveBeenCalledOnce();
    expect(retryDeliveryMock).toHaveBeenCalledTimes(2);
    expect(retryDeliveryMock).toHaveBeenLastCalledWith(
      'delivery-1',
      expect.objectContaining({ status: 'sent' }),
      3,
    );
  });

  it('stops retrying after MAX_ATTEMPTS and logs final failure', async () => {
    setupPrefs(makePrefs({ smsEnabled: false, pushEnabled: false }));

    const sendMock = vi.fn().mockResolvedValue({ status: 'failed', errorMessage: 'always fails' });
    const emailAdapter: ChannelAdapter = { channel: 'email', send: sendMock };

    const dispatchPromise = notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter],
    );

    await vi.runAllTimersAsync();
    await dispatchPromise;

    expect(sendMock).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS = 3
    expect(retryDeliveryMock).toHaveBeenCalledTimes(2);
    expect(retryDeliveryMock).toHaveBeenLastCalledWith(
      'delivery-1',
      expect.objectContaining({ status: 'failed' }),
      3,
    );
  });
});

describe('localization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes user locale to the template builder', async () => {
    setupPrefs(makePrefs({ locale: 'fr', smsEnabled: false, pushEnabled: false }));
    const sendMock = vi.fn().mockResolvedValue({ status: 'sent' });
    const emailAdapter: ChannelAdapter = { channel: 'email', send: sendMock };

    const dispatchPromise = notifyTransactionStatusUpdate(
      { transaction: baseTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter],
    );

    await vi.runAllTimersAsync();
    await dispatchPromise;

    const [, subject] = sendMock.mock.calls[0] as [string, string, string];
    expect(subject).toMatch(/terminée/i);
  });
});
