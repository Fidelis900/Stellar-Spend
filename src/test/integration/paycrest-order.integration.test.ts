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
  paycrestOrderLimiter: { check: vi.fn().mockReturnValue({ allowed: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// ── Idempotency mock (pass-through) ───────────────────────────────────────────
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: async (_req: NextRequest, handler: () => Promise<Response>) => handler(),
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
import { PaycrestHttpError } from '@/lib/offramp';
import * as rateLimiter from '@/lib/offramp';

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

describe('POST /api/offramp/paycrest/order (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates order and returns { data: { id, receiveAddress } }', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-1', receiveAddress: '0xabc123' });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ id: 'order-1', receiveAddress: '0xabc123' });
  });

  it('calls PaycrestAdapter.createOrder with normalized values', async () => {
    mockCreateOrder.mockResolvedValue({ id: 'order-2', receiveAddress: '0xdef' });
    await POST(makeReq(VALID_BODY));
    expect(mockCreateOrder).toHaveBeenCalledOnce();
    const args = mockCreateOrder.mock.calls[0][0];
    expect(args.amount).toBe(100);
    expect(args.rate).toBe(1600);
    expect(args.token).toBe('USDC');
    expect(args.recipient.institution).toBe('ACCESS');
  });

  it('returns 400 when amount is missing', async () => {
    const { amount: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('amount');
  });

  it('returns 400 when amount is not a positive number', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, amount: -5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details.amount).toMatch(/positive/i);
  });

  it('returns 400 when rate is missing', async () => {
    const { rate: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('rate');
  });

  it('returns 400 when token is missing', async () => {
    const { token: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('token');
  });

  it('returns 400 when recipient is missing', async () => {
    const { recipient: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('recipient');
  });

  it('returns 400 when recipient.institution is empty', async () => {
    const body = { ...VALID_BODY, recipient: { ...VALID_BODY.recipient, institution: '' } };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('recipient.institution');
  });

  it('returns 400 when recipient.accountIdentifier is missing', async () => {
    const body = {
      ...VALID_BODY,
      recipient: { ...VALID_BODY.recipient, accountIdentifier: '' },
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toHaveProperty('recipient.accountIdentifier');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(rateLimiter.paycrestOrderLimiter.check).mockReturnValueOnce({
      allowed: false,
      retryAfter: 30,
    } as any);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('propagates Paycrest HTTP 401 error', async () => {
    mockCreateOrder.mockRejectedValue(new PaycrestHttpError('Unauthorized', 401));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('propagates Paycrest HTTP 422 error', async () => {
    mockCreateOrder.mockRejectedValue(new PaycrestHttpError('Unprocessable Entity', 422));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(422);
  });

  it('returns 500 for unexpected errors', async () => {
    mockCreateOrder.mockRejectedValue(new Error('Network timeout'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
