import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── DB mock ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/db/dal', () => ({
  dal: { save: vi.fn() },
}));

// ── Fee calculation mock ──────────────────────────────────────────────────────
vi.mock('@/lib/fee-calculation', () => ({
  calculateAllFees: vi.fn().mockResolvedValue({
    bridgeFee: '0.5',
    networkFee: '0.1',
    paycrestFee: '0',
    totalFee: '0.6',
  }),
}));

// ── Idempotency mock (pass-through) ───────────────────────────────────────────
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: async (_req: NextRequest, handler: () => Promise<Response>) => handler(),
}));

import { POST } from '@/app/api/offramp/execute-payout/route';
import { dal } from '@/lib/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_BODY = {
  userAddress: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  amount: '100',
  currency: 'NGN',
  feeMethod: 'USDC',
  receiveAmount: '99.5',
  beneficiary: {
    institution: 'ACCESS',
    accountIdentifier: '1234567890',
    accountName: 'John Doe',
    currency: 'NGN',
  },
};

function makeReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/offramp/execute-payout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/offramp/execute-payout (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dal.save).mockResolvedValue(undefined);
  });

  it('creates a transaction and returns { id, status: "pending" }', async () => {
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: expect.any(String), status: 'pending' });
    expect(dal.save).toHaveBeenCalledOnce();
  });

  it('saves transaction with correct fields', async () => {
    await POST(makeReq(VALID_BODY));
    const saved = vi.mocked(dal.save).mock.calls[0][0];
    expect(saved).toMatchObject({
      userAddress: VALID_BODY.userAddress,
      amount: VALID_BODY.amount,
      currency: VALID_BODY.currency,
      status: 'pending',
      beneficiary: VALID_BODY.beneficiary,
    });
  });

  it('normalizes USDC feeMethod to stablecoin', async () => {
    await POST(makeReq({ ...VALID_BODY, feeMethod: 'USDC' }));
    const saved = vi.mocked(dal.save).mock.calls[0][0];
    expect(saved.feeMethod).toBe('stablecoin');
  });

  it('normalizes XLM feeMethod to native', async () => {
    await POST(makeReq({ ...VALID_BODY, feeMethod: 'XLM' }));
    const saved = vi.mocked(dal.save).mock.calls[0][0];
    expect(saved.feeMethod).toBe('native');
  });

  it('returns 400 when userAddress is missing', async () => {
    const { userAddress: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it('returns 400 when amount is missing', async () => {
    const { amount: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it('returns 400 when beneficiary is missing', async () => {
    const { beneficiary: _, ...body } = VALID_BODY;
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = new NextRequest('http://localhost/api/offramp/execute-payout', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid request body/i);
  });

  it('returns 500 when DB save fails', async () => {
    vi.mocked(dal.save).mockRejectedValue(new Error('DB connection failed'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/internal server error/i);
  });

  it('skips fee calculation when feeMethod is not provided', async () => {
    const { feeMethod: _, ...body } = VALID_BODY;
    await POST(makeReq(body));
    const saved = vi.mocked(dal.save).mock.calls[0][0];
    expect(saved.feeMethod).toBeUndefined();
    expect(saved.totalFee).toBeUndefined();
  });
});
