/**
 * #854 — Unit tests for notification channel adapters
 *
 * Each adapter is tested in isolation with a mocked `fetch` transport.
 * Verified behaviours:
 *  - Successful send → status 'sent' + optional providerMessageId from body
 *  - Non-2xx HTTP response → status 'failed' with HTTP status in errorMessage
 *  - Missing env-var configuration → status 'skipped' (no throw)
 *  - Network-level throw → propagated to caller (service retries on these)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAdapter, SmsAdapter, PushAdapter } from '@/lib/notifications';

// ── test helpers ──────────────────────────────────────────────────────────────

function buildFetch(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

// ── EmailAdapter ──────────────────────────────────────────────────────────────

describe('EmailAdapter', () => {
  const saved = { ...process.env };

  beforeEach(() => { vi.unstubAllGlobals(); process.env = { ...saved }; });
  afterEach(() => { process.env = saved; vi.unstubAllGlobals(); });

  it('returns skipped when EMAIL_NOTIFICATION_ENDPOINT is absent', async () => {
    delete process.env.EMAIL_NOTIFICATION_ENDPOINT;
    const result = await new EmailAdapter().send('user@x.com', 'S', 'M');
    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toContain('EMAIL_NOTIFICATION_ENDPOINT');
    // fetch must not be called
    expect(globalThis.fetch).toBeUndefined();
  });

  it('POSTs correct JSON payload and returns sent + providerMessageId on 2xx', async () => {
    process.env.EMAIL_NOTIFICATION_ENDPOINT = 'https://mail.test/send';
    process.env.EMAIL_NOTIFICATION_FROM = 'noreply@stellar-spend.io';
    const fetchMock = buildFetch(200, { messageId: 'email-1' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new EmailAdapter().send('recipient@x.com', 'Hello', 'World');

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('email-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mail.test/send');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ to: 'recipient@x.com', subject: 'Hello', from: 'noreply@stellar-spend.io' });
  });

  it('sends Authorization header when EMAIL_NOTIFICATION_AUTH_TOKEN is set', async () => {
    process.env.EMAIL_NOTIFICATION_ENDPOINT = 'https://mail.test/send';
    process.env.EMAIL_NOTIFICATION_AUTH_TOKEN = 'tok-email';
    const fetchMock = buildFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);

    await new EmailAdapter().send('a@b.com', 'S', 'M');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-email');
  });

  it('returns failed when endpoint responds with 5xx', async () => {
    process.env.EMAIL_NOTIFICATION_ENDPOINT = 'https://mail.test/send';
    vi.stubGlobal('fetch', buildFetch(503, {}));

    const result = await new EmailAdapter().send('a@b.com', 'S', 'M');
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/503/);
  });

  it('returns sent even when response body has no messageId', async () => {
    process.env.EMAIL_NOTIFICATION_ENDPOINT = 'https://mail.test/send';
    vi.stubGlobal('fetch', buildFetch(202, { ok: true }));

    const result = await new EmailAdapter().send('a@b.com', 'S', 'M');
    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBeUndefined();
  });

  it('propagates network-level errors to the caller', async () => {
    process.env.EMAIL_NOTIFICATION_ENDPOINT = 'https://mail.test/send';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(new EmailAdapter().send('a@b.com', 'S', 'M')).rejects.toThrow('Network error');
  });
});

// ── SmsAdapter ────────────────────────────────────────────────────────────────

describe('SmsAdapter', () => {
  const saved = { ...process.env };

  beforeEach(() => { vi.unstubAllGlobals(); process.env = { ...saved }; });
  afterEach(() => { process.env = saved; vi.unstubAllGlobals(); });

  it('returns skipped when SMS_NOTIFICATION_ENABLED is not "true"', async () => {
    process.env.SMS_NOTIFICATION_ENABLED = 'false';
    process.env.SMS_NOTIFICATION_ENDPOINT = 'https://sms.test/send';

    const result = await new SmsAdapter().send('+2348000000', 'S', 'M');
    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toContain('SMS notifications not configured');
  });

  it('returns skipped when SMS_NOTIFICATION_ENDPOINT is absent', async () => {
    process.env.SMS_NOTIFICATION_ENABLED = 'true';
    delete process.env.SMS_NOTIFICATION_ENDPOINT;

    const result = await new SmsAdapter().send('+2348000000', 'S', 'M');
    expect(result.status).toBe('skipped');
  });

  it('POSTs phone + message (subject ignored) and returns sent on 2xx', async () => {
    process.env.SMS_NOTIFICATION_ENABLED = 'true';
    process.env.SMS_NOTIFICATION_ENDPOINT = 'https://sms.test/send';
    const fetchMock = buildFetch(200, { messageId: 'sms-1' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SmsAdapter().send('+2348000000', 'Ignored Subject', 'Your tx is done.');

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('sms-1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toBe('+2348000000');
    expect(body.message).toBe('Your tx is done.');
    // subject must NOT appear in the SMS body
    expect(body.subject).toBeUndefined();
  });

  it('sends Authorization header when SMS_NOTIFICATION_AUTH_TOKEN is set', async () => {
    process.env.SMS_NOTIFICATION_ENABLED = 'true';
    process.env.SMS_NOTIFICATION_ENDPOINT = 'https://sms.test/send';
    process.env.SMS_NOTIFICATION_AUTH_TOKEN = 'tok-sms';
    const fetchMock = buildFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);

    await new SmsAdapter().send('+1', 'S', 'M');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-sms');
  });

  it('returns failed when endpoint responds with 4xx', async () => {
    process.env.SMS_NOTIFICATION_ENABLED = 'true';
    process.env.SMS_NOTIFICATION_ENDPOINT = 'https://sms.test/send';
    vi.stubGlobal('fetch', buildFetch(429, {}));

    const result = await new SmsAdapter().send('+2348000000', 'S', 'M');
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/429/);
  });

  it('propagates network-level errors to the caller', async () => {
    process.env.SMS_NOTIFICATION_ENABLED = 'true';
    process.env.SMS_NOTIFICATION_ENDPOINT = 'https://sms.test/send';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('SMS failure')));

    await expect(new SmsAdapter().send('+1', 'S', 'M')).rejects.toThrow('SMS failure');
  });
});

// ── PushAdapter ───────────────────────────────────────────────────────────────

describe('PushAdapter', () => {
  const saved = { ...process.env };

  beforeEach(() => { vi.unstubAllGlobals(); process.env = { ...saved }; });
  afterEach(() => { process.env = saved; vi.unstubAllGlobals(); });

  it('returns skipped when PUSH_NOTIFICATION_ENDPOINT is absent', async () => {
    delete process.env.PUSH_NOTIFICATION_ENDPOINT;

    const result = await new PushAdapter().send('device-tok', 'T', 'B');
    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toContain('PUSH_NOTIFICATION_ENDPOINT');
  });

  it('POSTs token, title (=subject), body (=message) and returns sent on 2xx', async () => {
    process.env.PUSH_NOTIFICATION_ENDPOINT = 'https://push.test/send';
    const fetchMock = buildFetch(200, { messageId: 'push-1' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new PushAdapter().send('device-tok', 'Payment done', 'Funds arrived.');

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('push-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://push.test/send');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.token).toBe('device-tok');
    expect(body.title).toBe('Payment done');
    expect(body.body).toBe('Funds arrived.');
  });

  it('sends Authorization header when PUSH_NOTIFICATION_AUTH_TOKEN is set', async () => {
    process.env.PUSH_NOTIFICATION_ENDPOINT = 'https://push.test/send';
    process.env.PUSH_NOTIFICATION_AUTH_TOKEN = 'tok-push';
    const fetchMock = buildFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);

    await new PushAdapter().send('tok', 'T', 'B');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-push');
  });

  it('returns failed when endpoint responds with 500', async () => {
    process.env.PUSH_NOTIFICATION_ENDPOINT = 'https://push.test/send';
    vi.stubGlobal('fetch', buildFetch(500, {}));

    const result = await new PushAdapter().send('tok', 'T', 'B');
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/500/);
  });

  it('propagates network-level errors to the caller', async () => {
    process.env.PUSH_NOTIFICATION_ENDPOINT = 'https://push.test/send';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Push failure')));

    await expect(new PushAdapter().send('tok', 'T', 'B')).rejects.toThrow('Push failure');
  });
});

// ── channel property ──────────────────────────────────────────────────────────

describe('adapter channel identifiers', () => {
  it('each adapter exposes the correct static channel name', () => {
    expect(new EmailAdapter().channel).toBe('email');
    expect(new SmsAdapter().channel).toBe('sms');
    expect(new PushAdapter().channel).toBe('push');
  });
});
