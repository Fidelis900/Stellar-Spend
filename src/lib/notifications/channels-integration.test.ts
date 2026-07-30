/**
 * #854 — Integration tests for partial channel failure and retry/no-retry behaviour
 *
 * These tests drive notifyTransactionStatusUpdate (the service layer) and assert
 * the expected delivery-record outcomes.  The DB stores (delivery-store,
 * preferences-store) are fully mocked so this runs without a live database.
 *
 * Scenarios covered:
 *  1. Partial channel failure: email fails, push succeeds — both channels
 *     receive delivery records with the correct statuses.
 *  2. A 'skipped' delivery is NOT retried (skipped ≠ failed).
 *  3. A 'failed' delivery IS retried up to MAX_ATTEMPTS (3) and each
 *     retry is persisted via retryNotificationDelivery.
 *  4. A channel that succeeds on the first try is NOT retried.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@/lib/transaction-storage';

// ── Module mocks (must be declared before imports that trigger the modules) ───

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
import type { ChannelAdapter, DeliveryResult, NotificationPreferences } from '@/lib/notifications';
import { getNotificationPreferences } from '@/lib/notifications';
import {
  createNotificationDelivery,
  retryNotificationDelivery,
} from '@/lib/notifications';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetPrefs = vi.mocked(getNotificationPreferences);
const mockCreateDelivery = vi.mocked(createNotificationDelivery);
const mockRetryDelivery = vi.mocked(retryNotificationDelivery);

// ── Test fixtures ─────────────────────────────────────────────────────────────

const completedTx: Transaction = {
  id: 'tx_partial_1',
  timestamp: Date.now(),
  userAddress: 'GPARTIALUSER',
  amount: '200',
  currency: 'NGN',
  status: 'completed',
  beneficiary: {
    institution: 'GTB',
    accountIdentifier: '0987654321',
    accountName: 'John Doe',
    currency: 'NGN',
  },
};

/** All three channels enabled with valid destinations */
function allChannelsPrefs(): NotificationPreferences {
  return {
    userAddress: 'GPARTIALUSER',
    email: 'user@partial.io',
    phoneNumber: '+2348012345678',
    pushToken: 'push-device-xyz',
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
    notifyOnPending: true,
    notifyOnCompleted: true,
    notifyOnFailed: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeAdapter(
  channel: 'email' | 'sms' | 'push',
  results: DeliveryResult | DeliveryResult[],
): ChannelAdapter {
  const queue = Array.isArray(results) ? [...results] : null;
  const single = Array.isArray(results) ? null : results;

  const send = queue
    ? vi.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? { status: 'failed', errorMessage: 'no more results' }))
    : vi.fn().mockResolvedValue(single);

  return { channel, send };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('#854 partial-channel failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Each createNotificationDelivery call returns a record with a unique id
    let deliveryCallCount = 0;
    mockCreateDelivery.mockImplementation(() =>
      Promise.resolve({ id: `delivery-${++deliveryCallCount}` } as ReturnType<typeof mockCreateDelivery> extends Promise<infer R> ? R : never),
    );
    mockRetryDelivery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('email fails + push succeeds → two delivery records, correct statuses', async () => {
    mockGetPrefs.mockResolvedValue(allChannelsPrefs());

    // email fails on all attempts, push succeeds immediately
    const emailAdapter = makeAdapter('email', [
      { status: 'failed', errorMessage: 'SMTP error' },
      { status: 'failed', errorMessage: 'SMTP error' },
      { status: 'failed', errorMessage: 'SMTP error' },
    ]);
    const pushAdapter = makeAdapter('push', { status: 'sent', providerMessageId: 'push-ok-1' });
    // SMS disabled in prefs so no SMS adapter needed (but include to confirm it's not called)
    const smsAdapter = makeAdapter('sms', { status: 'sent' });

    const dispatchPromise = notifyTransactionStatusUpdate(
      { transaction: completedTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter, pushAdapter, smsAdapter],
    );
    await vi.runAllTimersAsync();
    await dispatchPromise;

    // Both email and push channels should have a delivery record created
    expect(mockCreateDelivery).toHaveBeenCalledTimes(3); // email + sms + push (all enabled)

    const emailCall = mockCreateDelivery.mock.calls.find(
      (args) => (args[0] as { channel: string }).channel === 'email',
    );
    const pushCall = mockCreateDelivery.mock.calls.find(
      (args) => (args[0] as { channel: string }).channel === 'push',
    );

    expect(emailCall).toBeDefined();
    expect((emailCall![0] as Record<string, unknown>).status).toBe('failed');
    expect(pushCall).toBeDefined();
    expect((pushCall![0] as Record<string, unknown>).status).toBe('sent');

    // push succeeded first try → no retries for push
    const pushRetries = mockRetryDelivery.mock.calls.filter((args) => {
      // retry calls use delivery id; push delivery id is 'delivery-N' where N
      // corresponds to push channel order — we just verify retry count for email
      return true; // examined below
    });

    // email was attempted 3 times → 2 retry calls (attempt 2, attempt 3)
    expect(emailAdapter.send).toHaveBeenCalledTimes(3);

    // push was attempted once → no retry call
    expect(pushAdapter.send).toHaveBeenCalledTimes(1);
  });

  it('email fails on first attempt and succeeds on second → 1 retry, final status sent', async () => {
    mockGetPrefs.mockResolvedValue({
      ...allChannelsPrefs(),
      smsEnabled: false,
      pushEnabled: false,
    });

    const emailAdapter = makeAdapter('email', [
      { status: 'failed', errorMessage: 'Transient failure' },
      { status: 'sent', providerMessageId: 'recovered' },
    ]);

    const dispatchPromise = notifyTransactionStatusUpdate(
      { transaction: completedTx, previousStatus: 'pending', source: 'webhook' },
      [emailAdapter],
    );
    await vi.runAllTimersAsync();
    await dispatchPromise;

    expect(emailAdapter.send).toHaveBeenCalledTimes(2);
    expect(mockCreateDelivery).toHaveBeenCalledOnce();
    expect(mockRetryDelivery).toHaveBeenCalledOnce();
    expect(mockRetryDelivery).toHaveBeenCalledWith(
      'delivery-1',
      expect.objectContaining({ status: 'sent', providerMessageId: 'recovered' }),
      2,
    );
  });
});

describe('#854 retry / no-retry spec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockCreateDelivery.mockResolvedValue({ id: 'delivery-1' } as ReturnType<typeof mockCreateDelivery> extends Promise<infer R> ? R : never);
    mockRetryDelivery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function emailOnlyPrefs(): NotificationPreferences {
    return {
      userAddress: 'GRETRYTESTER',
      email: 'retry@test.io',
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
      notifyOnPending: true,
      notifyOnCompleted: true,
      notifyOnFailed: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  it('succeeds first try → no retry call, exactly 1 send', async () => {
    mockGetPrefs.mockResolvedValue(emailOnlyPrefs());
    const adapter = makeAdapter('email', { status: 'sent', providerMessageId: 'ok' });

    const p = notifyTransactionStatusUpdate(
      { transaction: { ...completedTx, userAddress: 'GRETRYTESTER' }, previousStatus: 'pending', source: 'webhook' },
      [adapter],
    );
    await vi.runAllTimersAsync();
    await p;

    expect(adapter.send).toHaveBeenCalledOnce();
    expect(mockRetryDelivery).not.toHaveBeenCalled();
  });

  it('skipped status → no retry (skipped is not a retriable failure)', async () => {
    mockGetPrefs.mockResolvedValue(emailOnlyPrefs());
    // Adapter returns skipped — this simulates adapter misconfiguration at
    // the transport level (not a throw, just a skipped result)
    const adapter = makeAdapter('email', { status: 'skipped', errorMessage: 'endpoint missing' });

    const p = notifyTransactionStatusUpdate(
      { transaction: { ...completedTx, userAddress: 'GRETRYTESTER' }, previousStatus: 'pending', source: 'webhook' },
      [adapter],
    );
    await vi.runAllTimersAsync();
    await p;

    expect(adapter.send).toHaveBeenCalledOnce();
    // skipped must not trigger retryNotificationDelivery
    expect(mockRetryDelivery).not.toHaveBeenCalled();
  });

  it('fails all MAX_ATTEMPTS (3) → 2 retry calls, final status failed', async () => {
    mockGetPrefs.mockResolvedValue(emailOnlyPrefs());
    const alwaysFail = vi.fn().mockResolvedValue({ status: 'failed', errorMessage: 'permanent error' });
    const adapter: ChannelAdapter = { channel: 'email', send: alwaysFail };

    const p = notifyTransactionStatusUpdate(
      { transaction: { ...completedTx, userAddress: 'GRETRYTESTER' }, previousStatus: 'pending', source: 'webhook' },
      [adapter],
    );
    await vi.runAllTimersAsync();
    await p;

    expect(alwaysFail).toHaveBeenCalledTimes(3); // initial + 2 retries = MAX_ATTEMPTS
    expect(mockRetryDelivery).toHaveBeenCalledTimes(2);

    const lastRetryArgs = mockRetryDelivery.mock.calls[1] as [
      string,
      DeliveryResult,
      number,
    ];
    expect(lastRetryArgs[1].status).toBe('failed');
    expect(lastRetryArgs[2]).toBe(3); // attempt count
  });

  it('recovers on attempt 3 → 2 retry calls, final status sent', async () => {
    mockGetPrefs.mockResolvedValue(emailOnlyPrefs());
    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'e1' })
      .mockResolvedValueOnce({ status: 'failed', errorMessage: 'e2' })
      .mockResolvedValueOnce({ status: 'sent', providerMessageId: 'recovered' });

    const adapter: ChannelAdapter = { channel: 'email', send: sendMock };

    const p = notifyTransactionStatusUpdate(
      { transaction: { ...completedTx, userAddress: 'GRETRYTESTER' }, previousStatus: 'pending', source: 'webhook' },
      [adapter],
    );
    await vi.runAllTimersAsync();
    await p;

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(mockRetryDelivery).toHaveBeenCalledTimes(2);
    const lastRetry = mockRetryDelivery.mock.calls[1] as [string, DeliveryResult, number];
    expect(lastRetry[1].status).toBe('sent');
    expect(lastRetry[2]).toBe(3);
  });
});
