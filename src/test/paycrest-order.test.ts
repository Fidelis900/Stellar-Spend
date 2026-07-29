import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Env mock ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/env', () => ({
  env: {
    server: {
      PAYCREST_API_KEY: 'test-api-key',
      PAYCREST_WEBHOOK_SECRET: 'test-secret',
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

// ── Rate limiter mock (always allow) ─────────────────────────────────────────
vi.mock('@/lib/offramp/utils/rate-limiter', () => ({
  paycrestOrderLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: async (_request: NextRequest, handler: () => Promise<Response>) => handler(),
}));

// ── PaycrestAdapter mock ──────────────────────────────────────────────────────
const mockCreateOrder = vi.fn();

vi.mock('@/lib/offramp/adapters/paycrest-adapter', () => ({
  PaycrestAdapter: class {
    createOrder = mockCreateOrder;
  },
  PaycrestHttpError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'PaycrestHttpError';
      this.status = status;
    }
  },
}));

import { POST } from '@/app/api/offramp/paycrest/order/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_BODY = {
  amount: 100,
  rate: 1600,
  token: 'USDC',
  network: 'stellar',
  reference: 'ref-001',
  returnAddress: '0xreturnAddress',
  recipient: {
    institution: 'ACCESS',
    accountIdentifier: '1234567890',
    accountName: 'John Doe',
    currency: 'NGN',
  },
};

function makeReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/offramp/paycrest/order', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/offramp/paycrest/order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates order and returns { data: { id, receiveAddress } }', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1', receiveAddress: '0xabc' });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ id: 'order-1', receiveAddress: '0xabc' });
  });

  it('returns 400 when amount is missing', async () => {
    const { amount: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('amount');
  });

  it('returns 400 when recipient.institution is missing', async () => {
    const body = {
      ...VALID_BODY,
      recipient: { ...VALID_BODY.recipient, institution: '' },
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('recipient.institution');
  });

  it('propagates Paycrest HTTP error status', async () => {
    const PaycrestHttpError = (await import('@/lib/offramp/adapters/paycrest-adapter'))
      .PaycrestHttpError;
    mockCreateOrder.mockRejectedValue(new PaycrestHttpError('Unauthorized', 401));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 500 when PAYCREST_API_KEY is missing', async () => {
    // Simulate missing key by making createOrder throw a generic error
    mockCreateOrder.mockRejectedValue(new Error('Internal server error'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
