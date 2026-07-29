import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyWebhookSignature,
  verifyProviderSignature,
  generateOutgoingSignature,
  buildSignedWebhookHeaders,
  WebhookSecurity,
} from './security';

vi.mock('@/lib/db/client', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withContext: vi.fn().mockReturnThis(),
  },
}));

const SECRET = 'test-secret-key';
const PAYLOAD = '{"event":"payment_order.settled","data":{"id":"order_123"}}';

async function makeSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Buffer.from(mac).toString('hex');
}

describe('verifyWebhookSignature', () => {
  it('accepts valid signature without timestamp', async () => {
    const sig = await makeSignature(PAYLOAD, SECRET);
    const result = await verifyWebhookSignature(PAYLOAD, sig, SECRET);
    expect(result.valid).toBe(true);
  });

  it('rejects missing signature', async () => {
    const result = await verifyWebhookSignature(PAYLOAD, '', SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/missing/i);
  });

  it('rejects wrong signature', async () => {
    const result = await verifyWebhookSignature(PAYLOAD, 'deadbeef'.repeat(8), SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid/i);
  });

  it('rejects expired timestamp', async () => {
    const sig = await makeSignature(PAYLOAD, SECRET);
    const oldTimestamp = String(Date.now() - 10 * 60 * 1000);
    const result = await verifyWebhookSignature(PAYLOAD, sig, SECRET, oldTimestamp);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/timestamp/i);
  });

  it('accepts fresh timestamp', async () => {
    const sig = await makeSignature(PAYLOAD, SECRET);
    const result = await verifyWebhookSignature(PAYLOAD, sig, SECRET, String(Date.now()));
    expect(result.valid).toBe(true);
  });

  it('detects replay attacks (same nonce key)', async () => {
    const sig = await makeSignature(PAYLOAD, SECRET);
    const nonce = 'unique-nonce-replay-test';
    const first = await verifyWebhookSignature(PAYLOAD, sig, SECRET, null, nonce);
    expect(first.valid).toBe(true);
    const sig2 = await makeSignature(PAYLOAD, SECRET);
    const second = await verifyWebhookSignature(PAYLOAD, sig2, SECRET, null, nonce);
    expect(second.valid).toBe(false);
    expect(second.reason).toMatch(/replay/i);
  });
});

describe('verifyProviderSignature', () => {
  it('accepts valid signature with timestamp and nonce options', async () => {
    const sig = await makeSignature(PAYLOAD, SECRET);
    const result = await verifyProviderSignature(PAYLOAD, sig, SECRET, {
      timestamp: String(Date.now()),
      nonce: 'provider-nonce-1',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects with empty options', async () => {
    const result = await verifyProviderSignature(PAYLOAD, '', SECRET, {});
    expect(result.valid).toBe(false);
  });
});

describe('generateOutgoingSignature', () => {
  it('generates consistent HMAC signature', async () => {
    const sig1 = await generateOutgoingSignature(PAYLOAD, SECRET);
    const sig2 = await generateOutgoingSignature(PAYLOAD, SECRET);
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });
});

describe('buildSignedWebhookHeaders', () => {
  it('returns required headers', async () => {
    const headers = await buildSignedWebhookHeaders(PAYLOAD, SECRET);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Webhook-Timestamp']).toBeDefined();
    expect(headers['X-Webhook-Signature']).toHaveLength(64);
  });
});

describe('WebhookSecurity class', () => {
  it('exposes static methods matching function exports', async () => {
    expect(WebhookSecurity.verifyProviderSignature).toBe(verifyProviderSignature);
    expect(WebhookSecurity.verifyWebhookSignature).toBe(verifyWebhookSignature);
    expect(WebhookSecurity.generateOutgoingSignature).toBe(generateOutgoingSignature);
    expect(WebhookSecurity.buildSignedWebhookHeaders).toBe(buildSignedWebhookHeaders);
    expect(typeof WebhookSecurity.createNonceTable).toBe('function');
  });
});
