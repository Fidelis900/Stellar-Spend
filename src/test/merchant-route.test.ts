/**
 * Integration tests for #797 — merchant route as thin controller.
 *
 * Verifies that:
 *  - The route delegates all business logic to merchantService
 *  - The route applies zod validation before touching the service
 *  - The route returns correct HTTP status codes
 *  - The service is NOT called when validation fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Service mocks ─────────────────────────────────────────────────────────────
const mockCreateMerchant = vi.fn();
const mockGetMerchantByUserId = vi.fn();
const mockGetMerchantPayouts = vi.fn();
const mockCreateBulkPayout = vi.fn();

vi.mock('@/lib/services/merchant.service', () => ({
  merchantService: {
    createMerchant: (...a: unknown[]) => mockCreateMerchant(...a),
    getMerchantByUserId: (...a: unknown[]) => mockGetMerchantByUserId(...a),
    getMerchantPayouts: (...a: unknown[]) => mockGetMerchantPayouts(...a),
    createBulkPayout: (...a: unknown[]) => mockCreateBulkPayout(...a),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function postReq(body: unknown, url = 'http://localhost/api/merchant') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(query: Record<string, string>, url = 'http://localhost/api/merchant') {
  const u = new URL(url);
  Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v));
  return new NextRequest(u.toString());
}

function makeMerchant(overrides = {}) {
  return {
    id: 'merchant-001',
    userId: 'user-001',
    businessName: 'Acme Corp',
    businessEmail: 'billing@acme.com',
    role: 'owner',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── GET /api/merchant ─────────────────────────────────────────────────────────
describe('GET /api/merchant', () => {
  let GET: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mock('@/lib/services/merchant.service', () => ({
      merchantService: {
        createMerchant: (...a: unknown[]) => mockCreateMerchant(...a),
        getMerchantByUserId: (...a: unknown[]) => mockGetMerchantByUserId(...a),
        getMerchantPayouts: (...a: unknown[]) => mockGetMerchantPayouts(...a),
        createBulkPayout: (...a: unknown[]) => mockCreateBulkPayout(...a),
      },
    }));
    ({ GET } = await import('@/app/api/merchant/route'));
  });

  it('returns 400 when userId query param is missing', async () => {
    const res = await GET(getReq({}));
    expect(res.status).toBe(400);
    expect(mockGetMerchantByUserId).not.toHaveBeenCalled();
  });

  it('returns 404 when merchant does not exist', async () => {
    mockGetMerchantByUserId.mockResolvedValue(null);
    const res = await GET(getReq({ userId: 'unknown-user' }));
    expect(res.status).toBe(404);
  });

  it('returns 200 with merchant data when found', async () => {
    mockGetMerchantByUserId.mockResolvedValue(makeMerchant());
    const res = await GET(getReq({ userId: 'user-001' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('merchant-001');
    expect(body.data.businessName).toBe('Acme Corp');
  });

  it('delegates to merchantService.getMerchantByUserId with the correct userId', async () => {
    mockGetMerchantByUserId.mockResolvedValue(makeMerchant());
    await GET(getReq({ userId: 'specific-user' }));
    expect(mockGetMerchantByUserId).toHaveBeenCalledWith('specific-user');
  });

  it('returns 500 when service throws', async () => {
    mockGetMerchantByUserId.mockRejectedValue(new Error('DB error'));
    const res = await GET(getReq({ userId: 'user-001' }));
    expect(res.status).toBe(500);
  });
});

// ── POST /api/merchant ────────────────────────────────────────────────────────
describe('POST /api/merchant', () => {
  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mock('@/lib/services/merchant.service', () => ({
      merchantService: {
        createMerchant: (...a: unknown[]) => mockCreateMerchant(...a),
        getMerchantByUserId: (...a: unknown[]) => mockGetMerchantByUserId(...a),
        getMerchantPayouts: (...a: unknown[]) => mockGetMerchantPayouts(...a),
        createBulkPayout: (...a: unknown[]) => mockCreateBulkPayout(...a),
      },
    }));
    ({ POST } = await import('@/app/api/merchant/route'));
  });

  it('returns 400 and does NOT call service when userId is missing', async () => {
    const res = await POST(postReq({ businessName: 'Test', businessEmail: 'a@b.com' }));
    expect(res.status).toBe(400);
    expect(mockCreateMerchant).not.toHaveBeenCalled();
  });

  it('returns 400 when businessEmail is invalid', async () => {
    const res = await POST(postReq({ userId: 'u1', businessName: 'Test', businessEmail: 'bad' }));
    expect(res.status).toBe(400);
    expect(mockCreateMerchant).not.toHaveBeenCalled();
  });

  it('returns 201 with merchant data on success', async () => {
    mockCreateMerchant.mockResolvedValue(makeMerchant());
    const res = await POST(postReq({
      userId: 'user-001',
      businessName: 'Acme Corp',
      businessEmail: 'billing@acme.com',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('merchant-001');
  });

  it('delegates to merchantService.createMerchant with correct args', async () => {
    mockCreateMerchant.mockResolvedValue(makeMerchant());
    await POST(postReq({ userId: 'u-xyz', businessName: 'My Shop', businessEmail: 'shop@test.io' }));
    expect(mockCreateMerchant).toHaveBeenCalledWith('u-xyz', 'My Shop', 'shop@test.io');
  });

  it('returns 500 when service throws', async () => {
    mockCreateMerchant.mockRejectedValue(new Error('DB failure'));
    const res = await POST(postReq({
      userId: 'u1', businessName: 'Test', businessEmail: 'test@test.com',
    }));
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/merchant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json',
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockCreateMerchant).not.toHaveBeenCalled();
  });
});

// ── GET /api/merchant/payouts ─────────────────────────────────────────────────
describe('GET /api/merchant/payouts', () => {
  let GET: (req: any) => Promise<Response>;
  const BASE = 'http://localhost/api/merchant/payouts';

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mock('@/lib/services/merchant.service', () => ({
      merchantService: {
        createMerchant: (...a: unknown[]) => mockCreateMerchant(...a),
        getMerchantByUserId: (...a: unknown[]) => mockGetMerchantByUserId(...a),
        getMerchantPayouts: (...a: unknown[]) => mockGetMerchantPayouts(...a),
        createBulkPayout: (...a: unknown[]) => mockCreateBulkPayout(...a),
      },
    }));
    ({ GET } = await import('@/app/api/merchant/payouts/route'));
  });

  it('returns 400 when merchantId is missing', async () => {
    const res = await GET(getReq({}, BASE));
    expect(res.status).toBe(400);
    expect(mockGetMerchantPayouts).not.toHaveBeenCalled();
  });

  it('returns 200 with paginated payouts', async () => {
    mockGetMerchantPayouts.mockResolvedValue({ payouts: [], total: 0 });
    const res = await GET(getReq({ merchantId: 'm-001' }, BASE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('total');
  });
});

// ── POST /api/merchant/payouts ────────────────────────────────────────────────
describe('POST /api/merchant/payouts', () => {
  let POST: (req: any) => Promise<Response>;
  const BASE = 'http://localhost/api/merchant/payouts';

  const validPayoutBody = {
    merchantId: 'merchant-001',
    idempotencyKey: 'idem-001',
    items: [{
      beneficiaryInstitution: 'GTBank',
      beneficiaryAccount: '1234567890',
      beneficiaryName: 'John Doe',
      amount: 500,
      currency: 'NGN',
    }],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mock('@/lib/services/merchant.service', () => ({
      merchantService: {
        createMerchant: (...a: unknown[]) => mockCreateMerchant(...a),
        getMerchantByUserId: (...a: unknown[]) => mockGetMerchantByUserId(...a),
        getMerchantPayouts: (...a: unknown[]) => mockGetMerchantPayouts(...a),
        createBulkPayout: (...a: unknown[]) => mockCreateBulkPayout(...a),
      },
    }));
    ({ POST } = await import('@/app/api/merchant/payouts/route'));
  });

  it('returns 201 on valid payout creation', async () => {
    mockCreateBulkPayout.mockResolvedValue({ id: 'payout-001', status: 'pending' });
    const res = await POST(postReq(validPayoutBody, BASE));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('payout-001');
  });

  it('delegates to merchantService.createBulkPayout with correct args', async () => {
    mockCreateBulkPayout.mockResolvedValue({ id: 'payout-001' });
    await POST(postReq(validPayoutBody, BASE));
    expect(mockCreateBulkPayout).toHaveBeenCalledWith(
      'merchant-001',
      'idem-001',
      validPayoutBody.items,
    );
  });

  it('returns 400 when merchantId is missing', async () => {
    const { merchantId: _m, ...body } = validPayoutBody;
    const res = await POST(postReq(body, BASE));
    expect(res.status).toBe(400);
    expect(mockCreateBulkPayout).not.toHaveBeenCalled();
  });

  it('returns 400 when items array is empty', async () => {
    const res = await POST(postReq({ ...validPayoutBody, items: [] }, BASE));
    expect(res.status).toBe(400);
    expect(mockCreateBulkPayout).not.toHaveBeenCalled();
  });
});
