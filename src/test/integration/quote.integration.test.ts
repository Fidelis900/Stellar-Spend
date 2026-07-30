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

// ── Currency support mock ─────────────────────────────────────────────────────
vi.mock('@/lib/currencies', () => ({
  isSupportedCurrency: (c: string) => ['NGN', 'KES', 'GHS'].includes(c),
}));

// ── Validation mock ───────────────────────────────────────────────────────────
vi.mock('@/lib/offramp/utils/validation', () => ({
  validateAmount: (v: string) => parseFloat(v) > 0,
}));

// ── Quote utilities mock ──────────────────────────────────────────────────────
vi.mock('@/lib/offramp/utils/quote-fetcher', () => ({
  fetchPaycrestQuote: vi.fn(),
  buildQuote: vi.fn(),
  calculateBridgeAmount: vi.fn(),
}));

// ── Allbridge SDK mock ────────────────────────────────────────────────────────
const mockGetAmountToBeReceived = vi.fn();
const mockChainDetailsMap = vi.fn();

vi.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: class {
    chainDetailsMap = mockChainDetailsMap;
    getAmountToBeReceived = mockGetAmountToBeReceived;
  },
  nodeRpcUrlsDefault: {},
}));

// ── Timeout wrapper mock (pass-through) ───────────────────────────────────────
vi.mock('@/lib/offramp/utils/timeout', () => ({
  withAllbridgeTimeout: async (_fn: () => Promise<unknown>) => _fn(),
}));

// ── Error handler mock ────────────────────────────────────────────────────────
vi.mock('@/lib/error-handler', () => ({
  ErrorHandler: { serverError: vi.fn() },
}));

import { POST } from '@/app/api/offramp/quote/route';
import * as quoteFetcher from '@/lib/offramp';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/offramp/quote', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const STELLAR_USDC = { symbol: 'USDC', decimals: 7, chain: 'STELLAR' };
const BASE_USDC = { symbol: 'USDC', decimals: 6, chain: 'BASE' };

function setupSdkSuccess() {
  mockChainDetailsMap.mockResolvedValue({
    stellar: { name: 'Stellar', tokens: [STELLAR_USDC] },
    base: { name: 'Base Ethereum', tokens: [BASE_USDC] },
  });
  mockGetAmountToBeReceived.mockResolvedValue('99.5');
  vi.mocked(quoteFetcher.calculateBridgeAmount).mockReturnValue('99.5');
  vi.mocked(quoteFetcher.fetchPaycrestQuote).mockResolvedValue({
    rate: 1600,
    destinationAmount: '159200.00',
  });
  vi.mocked(quoteFetcher.buildQuote).mockReturnValue({
    destinationAmount: '159200.00',
    rate: 1600,
    currency: 'NGN',
    bridgeFee: '0.5',
    payoutFee: '0',
    estimatedTime: 300,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/offramp/quote (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid quote for a supported currency with USDC fee', async () => {
    setupSdkSuccess();
    const res = await POST(makeReq({ amount: '100', currency: 'NGN', feeMethod: 'USDC' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      destinationAmount: expect.any(String),
      rate: expect.any(Number),
      currency: 'NGN',
    });
  });

  it('returns a valid quote with XLM fee method', async () => {
    setupSdkSuccess();
    vi.mocked(quoteFetcher.buildQuote).mockReturnValue({
      destinationAmount: '80000.00',
      rate: 1600,
      currency: 'KES',
      bridgeFee: '0',
      payoutFee: '0',
      estimatedTime: 300,
    });
    const res = await POST(makeReq({ amount: '50', currency: 'KES', feeMethod: 'XLM' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.currency).toBe('KES');
  });

  it('returns 400 for invalid amount', async () => {
    const res = await POST(makeReq({ amount: '-10', currency: 'NGN', feeMethod: 'USDC' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/amount/i);
  });

  it('returns 400 for missing currency', async () => {
    const res = await POST(makeReq({ amount: '100', feeMethod: 'USDC' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/currency/i);
  });

  it('returns 400 for unsupported currency', async () => {
    const res = await POST(makeReq({ amount: '100', currency: 'XYZ', feeMethod: 'USDC' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported/i);
  });

  it('returns 400 for invalid feeMethod', async () => {
    const res = await POST(makeReq({ amount: '100', currency: 'NGN', feeMethod: 'BTC' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/feeMethod/i);
  });

  it('returns 502 when Allbridge SDK fails', async () => {
    vi.mocked(quoteFetcher.calculateBridgeAmount).mockReturnValue('99.5');
    mockChainDetailsMap.mockRejectedValue(new Error('Network error'));
    const res = await POST(makeReq({ amount: '100', currency: 'NGN', feeMethod: 'USDC' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/bridge quote unavailable/i);
  });

  it('returns 502 when Paycrest FX rate fetch fails', async () => {
    setupSdkSuccess();
    vi.mocked(quoteFetcher.fetchPaycrestQuote).mockRejectedValue(new Error('Paycrest down'));
    const res = await POST(makeReq({ amount: '100', currency: 'NGN', feeMethod: 'USDC' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/fx rate unavailable/i);
  });
});
