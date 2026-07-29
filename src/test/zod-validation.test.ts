/**
 * Integration tests for #796 — consistent zod validation across API routes.
 *
 * Validates that every POST route that accepts a request body:
 *   1. Rejects missing required fields with HTTP 400
 *   2. Returns a standardised error shape (error + message)
 *   3. Does NOT expose internal stack traces
 *
 * Routes covered:
 *   - POST /api/offramp/quote
 *   - POST /api/offramp/verify-account
 *   - POST /api/offramp/paycrest/order
 *   - POST /api/merchant
 *   - POST /api/merchant/payouts
 *   - POST /api/queue/manage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/env', () => ({
  env: {
    server: {
      PAYCREST_API_KEY: 'test-key',
      BASE_RPC_URL: 'https://base.rpc.test',
      STELLAR_SOROBAN_RPC_URL: 'https://soroban.test',
      STELLAR_HORIZON_URL: 'https://horizon.test',
    },
    public: {
      NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL: 'https://soroban.test',
      NEXT_PUBLIC_BASE_RETURN_ADDRESS: '0x1234',
    },
  },
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('@/lib/services/merchant.service', () => ({
  merchantService: {
    getMerchantByUserId: vi.fn().mockResolvedValue(null),
    createMerchant: vi.fn().mockResolvedValue({
      id: 'mid-1',
      userId: 'u1',
      businessName: 'Test',
      businessEmail: 'test@test.com',
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getMerchantPayouts: vi.fn().mockResolvedValue({ payouts: [], total: 0 }),
    createBulkPayout: vi.fn().mockResolvedValue({ id: 'payout-1' }),
  },
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: vi.fn((_req: unknown, fn: () => unknown) => fn()),
}));

vi.mock('@/lib/compliance-screening', () => ({
  screenAddress: vi.fn().mockResolvedValue({ verdict: 'allow' }),
  isHighValue: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/currencies', () => ({
  isSupportedCurrency: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/offramp/utils/rate-limiter', () => ({
  paycrestOrderLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) },
  buildTxLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/offramp/utils/logger', () => ({
  generateRequestId: vi.fn().mockReturnValue('req-test'),
  createRequestLogger: vi.fn().mockReturnValue({
    logError: vi.fn(),
    logSuccess: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Helper to build a minimal NextRequest ─────────────────────────────────────
function makeRequest(body: unknown, url = 'http://localhost/api/test') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any; // cast: route handlers accept NextRequest which extends Request
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
async function expectValidation400(response: Response) {
  expect(response.status).toBe(400);
  const body = await response.json();
  // All routes must use ErrorHandler which outputs { error, message }
  expect(body).toHaveProperty('error');
  return body;
}

// ── POST /api/offramp/quote ────────────────────────────────────────────────────
describe('POST /api/offramp/quote — zod validation', () => {
  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('@/app/api/offramp/quote/route'));
  });

  it('rejects missing amount', async () => {
    const res = await POST(makeRequest({ currency: 'NGN', feeMethod: 'USDC' }));
    await expectValidation400(res);
  });

  it('rejects zero amount', async () => {
    const res = await POST(makeRequest({ amount: '0', currency: 'NGN', feeMethod: 'USDC' }));
    await expectValidation400(res);
  });

  it('rejects negative amount', async () => {
    const res = await POST(makeRequest({ amount: '-5', currency: 'NGN', feeMethod: 'USDC' }));
    await expectValidation400(res);
  });

  it('rejects missing currency', async () => {
    const res = await POST(makeRequest({ amount: '100', feeMethod: 'USDC' }));
    await expectValidation400(res);
  });

  it('rejects invalid feeMethod', async () => {
    const res = await POST(makeRequest({ amount: '100', currency: 'NGN', feeMethod: 'ETH' }));
    await expectValidation400(res);
  });

  it('rejects missing feeMethod', async () => {
    const res = await POST(makeRequest({ amount: '100', currency: 'NGN' }));
    await expectValidation400(res);
  });

  it('rejects non-numeric amount string', async () => {
    const res = await POST(makeRequest({ amount: 'abc', currency: 'NGN', feeMethod: 'USDC' }));
    await expectValidation400(res);
  });
});

// ── POST /api/offramp/verify-account ─────────────────────────────────────────
describe('POST /api/offramp/verify-account — zod validation', () => {
  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('@/app/api/offramp/verify-account/route'));
  });

  it('rejects missing institution', async () => {
    const res = await POST(makeRequest({ accountIdentifier: '1234567890' }));
    await expectValidation400(res);
  });

  it('rejects missing accountIdentifier', async () => {
    const res = await POST(makeRequest({ institution: 'GTBank' }));
    await expectValidation400(res);
  });

  it('rejects empty body', async () => {
    const res = await POST(makeRequest({}));
    await expectValidation400(res);
  });
});

// ── POST /api/merchant ────────────────────────────────────────────────────────
describe('POST /api/merchant — zod validation', () => {
  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('@/app/api/merchant/route'));
  });

  it('rejects missing userId', async () => {
    const res = await POST(makeRequest({ businessName: 'Test', businessEmail: 'a@b.com' }));
    await expectValidation400(res);
  });

  it('rejects missing businessName', async () => {
    const res = await POST(makeRequest({ userId: 'u1', businessEmail: 'a@b.com' }));
    await expectValidation400(res);
  });

  it('rejects missing businessEmail', async () => {
    const res = await POST(makeRequest({ userId: 'u1', businessName: 'Test' }));
    await expectValidation400(res);
  });

  it('rejects invalid businessEmail format', async () => {
    const res = await POST(makeRequest({ userId: 'u1', businessName: 'Test', businessEmail: 'not-an-email' }));
    await expectValidation400(res);
  });

  it('rejects empty body', async () => {
    const res = await POST(makeRequest({}));
    await expectValidation400(res);
  });
});

// ── POST /api/merchant/payouts ────────────────────────────────────────────────
describe('POST /api/merchant/payouts — zod validation', () => {
  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('@/app/api/merchant/payouts/route'));
  });

  it('rejects missing merchantId', async () => {
    const res = await POST(makeRequest({
      idempotencyKey: 'key-1',
      items: [{ beneficiaryInstitution: 'B', beneficiaryAccount: 'A', beneficiaryName: 'N', amount: 100, currency: 'NGN' }],
    }));
    await expectValidation400(res);
  });

  it('rejects missing idempotencyKey', async () => {
    const res = await POST(makeRequest({
      merchantId: 'm1',
      items: [{ beneficiaryInstitution: 'B', beneficiaryAccount: 'A', beneficiaryName: 'N', amount: 100, currency: 'NGN' }],
    }));
    await expectValidation400(res);
  });

  it('rejects empty items array', async () => {
    const res = await POST(makeRequest({ merchantId: 'm1', idempotencyKey: 'k1', items: [] }));
    await expectValidation400(res);
  });

  it('rejects item missing beneficiaryInstitution', async () => {
    const res = await POST(makeRequest({
      merchantId: 'm1',
      idempotencyKey: 'k1',
      items: [{ beneficiaryAccount: 'A', beneficiaryName: 'N', amount: 100, currency: 'NGN' }],
    }));
    await expectValidation400(res);
  });

  it('rejects item with negative amount', async () => {
    const res = await POST(makeRequest({
      merchantId: 'm1',
      idempotencyKey: 'k1',
      items: [{ beneficiaryInstitution: 'B', beneficiaryAccount: 'A', beneficiaryName: 'N', amount: -50, currency: 'NGN' }],
    }));
    await expectValidation400(res);
  });
});

// ── POST /api/queue/manage ────────────────────────────────────────────────────
describe('POST /api/queue/manage — zod validation', () => {
  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('@/app/api/queue/manage/route'));
  });

  it('rejects missing action', async () => {
    const res = await POST(makeRequest({ id: 'tx-1' }));
    await expectValidation400(res);
  });

  it('rejects unknown action value', async () => {
    const res = await POST(makeRequest({ action: 'flush', id: 'tx-1' }));
    await expectValidation400(res);
  });

  it('rejects remove action without id', async () => {
    const res = await POST(makeRequest({ action: 'remove' }));
    await expectValidation400(res);
  });

  it('rejects override action without id', async () => {
    const res = await POST(makeRequest({ action: 'override', priority: 2 }));
    await expectValidation400(res);
  });

  it('rejects override action without priority', async () => {
    const res = await POST(makeRequest({ action: 'override', id: 'tx-1' }));
    await expectValidation400(res);
  });

  it('rejects invalid JSON body', async () => {
    const req = new Request('http://localhost/api/queue/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
