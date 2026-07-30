import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/dal', () => ({
  dal: {
    getByPayoutOrderId: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  },
  DatabaseError: class DatabaseError extends Error {},
}));

vi.mock('@/lib/webhook/dispatcher', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notifications/service', () => ({
  notifyTransactionStatusUpdate: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/env', () => ({
  env: {
    server: {
      PAYCREST_WEBHOOK_SECRET: 'test-webhook-secret',
      PAYCREST_API_KEY: 'test-api-key',
      BASE_PRIVATE_KEY: '0xdeadbeef',
      BASE_RETURN_ADDRESS: '0xreturn',
      BASE_RPC_URL: 'https://base-rpc.test',
      STELLAR_SOROBAN_RPC_URL: 'https://soroban.test',
      STELLAR_HORIZON_URL: 'https://horizon.test',
    },
    public: {
      NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL: 'https://soroban.test',
      NEXT_PUBLIC_BASE_RETURN_ADDRESS: '0xreturn',
      NEXT_PUBLIC_STELLAR_USDC_ISSUER: 'GISSUER',
    },
  },
}));

import { POST } from '@/app/api/webhooks/paycrest/route';
import { dal } from '@/lib/db';
import { notifyTransactionStatusUpdate } from '@/lib/notifications';
import { enqueue } from '@/lib/webhook';

async function hmacHex(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Buffer.from(mac).toString('hex');
}

function makeRequest(body: string, signature: string, timestamp?: string, nonce?: string): Request {
  const headers: Record<string, string> = {
    'X-Paycrest-Signature': signature,
  };
  if (timestamp) headers['X-Paycrest-Timestamp'] = timestamp;
  if (nonce) headers['X-Paycrest-Nonce'] = nonce;
  return new Request('http://localhost/api/webhooks/paycrest', {
    method: 'POST',
    body,
    headers,
  });
}

const FAKE_TRANSACTION = {
  id: 'tx-1',
  status: 'pending',
  payoutStatus: undefined,
  userAddress: 'GABC',
  amount: '100',
  currency: 'NGN',
};

describe('POST /api/webhooks/paycrest (integration)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(dal.getByPayoutOrderId).mockReset().mockResolvedValue(null);
    vi.mocked(dal.update).mockReset().mockResolvedValue(undefined);
    vi.mocked(dal.getById)
      .mockReset()
      .mockResolvedValue(FAKE_TRANSACTION as any);
    vi.mocked(enqueue).mockReset().mockResolvedValue(undefined);
    vi.mocked(notifyTransactionStatusUpdate).mockReset().mockResolvedValue(undefined);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('returns 200 with valid HMAC signature, timestamp, and nonce', async () => {
    const body = JSON.stringify({ event: 'payment_order.settled', data: { id: 'order-200-test' } });
    const sig = await hmacHex(body, 'test-webhook-secret');
    const res = await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });
  });

  it('returns 401 with invalid signature', async () => {
    const body = JSON.stringify({ event: 'payment_order.settled', data: { id: 'order-1' } });
    const res = await POST(makeRequest(body, 'invalid-sig', String(Date.now()), 'int-nonce-2'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature header is missing', async () => {
    const body = JSON.stringify({ event: 'payment_order.settled', data: { id: 'order-1' } });
    const req = new Request('http://localhost/api/webhooks/paycrest', { method: 'POST', body });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('detects and rejects replay attacks (same nonce)', async () => {
    const body = JSON.stringify({
      event: 'payment_order.settled',
      data: { id: 'order-replay-int' },
    });
    const sig = await hmacHex(body, 'test-webhook-secret');
    const ts = String(Date.now());
    const nonce = 'int-replay-nonce';
    const res1 = await POST(makeRequest(body, sig, ts, nonce));
    expect(res1.status).toBe(200);
    const res2 = await POST(makeRequest(body, sig, ts, nonce));
    expect(res2.status).toBe(401);
  });

  it('updates transaction to completed on payment_order.settled', async () => {
    vi.mocked(dal.getByPayoutOrderId).mockResolvedValue(FAKE_TRANSACTION as any);
    const body = JSON.stringify({
      event: 'payment_order.settled',
      data: { id: 'order-settled-1' },
    });
    const sig = await hmacHex(body, 'test-webhook-secret');
    await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-3'));
    expect(dal.update).toHaveBeenCalledWith('tx-1', {
      status: 'completed',
      payoutStatus: 'settled',
    });
  });

  it('updates transaction to failed on payment_order.refunded', async () => {
    vi.mocked(dal.getByPayoutOrderId).mockResolvedValue(FAKE_TRANSACTION as any);
    const body = JSON.stringify({
      event: 'payment_order.refunded',
      data: { id: 'order-refunded-1' },
    });
    const sig = await hmacHex(body, 'test-webhook-secret');
    await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-4'));
    expect(dal.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({
        status: 'failed',
        payoutStatus: 'refunded',
      }),
    );
  });

  it('updates transaction to failed on payment_order.expired', async () => {
    vi.mocked(dal.getByPayoutOrderId).mockResolvedValue(FAKE_TRANSACTION as any);
    const body = JSON.stringify({
      event: 'payment_order.expired',
      data: { id: 'order-expired-1' },
    });
    const sig = await hmacHex(body, 'test-webhook-secret');
    await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-5'));
    expect(dal.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({
        status: 'failed',
        payoutStatus: 'expired',
      }),
    );
  });

  it('updates payoutStatus to pending on payment_order.pending', async () => {
    vi.mocked(dal.getByPayoutOrderId).mockResolvedValue(FAKE_TRANSACTION as any);
    const body = JSON.stringify({
      event: 'payment_order.pending',
      data: { id: 'order-pending-1' },
    });
    const sig = await hmacHex(body, 'test-webhook-secret');
    await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-6'));
    expect(dal.update).toHaveBeenCalledWith('tx-1', { payoutStatus: 'pending' });
  });

  it('returns 200 without updating when no transaction found for orderId', async () => {
    const body = JSON.stringify({
      event: 'payment_order.settled',
      data: { id: 'order-unknown-1' },
    });
    const sig = await hmacHex(body, 'test-webhook-secret');
    const res = await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-7'));
    expect(res.status).toBe(200);
    expect(dal.update).not.toHaveBeenCalled();
  });

  it('fires notification after status update', async () => {
    vi.mocked(dal.getByPayoutOrderId).mockResolvedValue(FAKE_TRANSACTION as any);
    const body = JSON.stringify({ event: 'payment_order.settled', data: { id: 'order-notify-1' } });
    const sig = await hmacHex(body, 'test-webhook-secret');
    await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-8'));
    expect(notifyTransactionStatusUpdate).toHaveBeenCalledOnce();
  });

  it('returns 400 for malformed JSON payload', async () => {
    const body = 'not-json-payload-unique';
    const sig = await hmacHex(body, 'test-webhook-secret');
    const res = await POST(makeRequest(body, sig, String(Date.now()), 'int-nonce-9'));
    expect(res.status).toBe(400);
  });
});
