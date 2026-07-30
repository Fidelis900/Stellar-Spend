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
  buildTxLimiter: { check: vi.fn().mockReturnValue({ allowed: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// ── Validation mock ───────────────────────────────────────────────────────────
vi.mock('@/lib/offramp/utils/validation', () => ({
  validateAmount: vi.fn(),
  validateAddress: vi.fn(),
}));

// ── Allbridge SDK mock ────────────────────────────────────────────────────────
const mockSend = vi.fn();
const mockGetGasFeeOptions = vi.fn();
const mockChainDetailsMap = vi.fn();

const FAKE_SOURCE_TOKEN = { symbol: 'USDC', decimals: 7, contract: '0xsrc', chain: 'STELLAR' };
const FAKE_DEST_TOKEN = { symbol: 'USDC', decimals: 6, contract: '0xdst', chain: 'BASE' };

vi.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: class {
    chainDetailsMap = mockChainDetailsMap;
    getGasFeeOptions = mockGetGasFeeOptions;
    bridge = { rawTxBuilder: { send: mockSend } };
  },
  nodeRpcUrlsDefault: {},
  Messenger: { ALLBRIDGE: 'ALLBRIDGE' },
  FeePaymentMethod: {
    WITH_STABLECOIN: 'WITH_STABLECOIN',
    WITH_NATIVE_CURRENCY: 'WITH_NATIVE_CURRENCY',
  },
}));

import { POST } from '@/app/api/offramp/bridge/build-tx/route';
import * as validation from '@/lib/offramp';
import * as rateLimiter from '@/lib/offramp';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_STELLAR = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const VALID_BASE = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

function makeReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/offramp/bridge/build-tx', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function setupSdkSuccess() {
  vi.mocked(validation.validateAmount).mockReturnValue(true);
  vi.mocked(validation.validateAddress).mockReturnValue(true);
  mockChainDetailsMap.mockResolvedValue({
    stellar: { name: 'Stellar', tokens: [FAKE_SOURCE_TOKEN] },
    base: { name: 'Base', tokens: [FAKE_DEST_TOKEN] },
  });
  mockGetGasFeeOptions.mockResolvedValue({
    WITH_STABLECOIN: { float: '0.5' },
    WITH_NATIVE_CURRENCY: { float: '0.001' },
  });
  mockSend.mockResolvedValue('FAKE_XDR_STRING');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/offramp/bridge/build-tx (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns xdr and token info for a valid stablecoin-fee request', async () => {
    setupSdkSuccess();
    const res = await POST(
      makeReq({
        amount: '10',
        fromAddress: VALID_STELLAR,
        toAddress: VALID_BASE,
        feePaymentMethod: 'stablecoin',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      xdr: 'FAKE_XDR_STRING',
      sourceToken: { symbol: 'USDC', chain: 'STELLAR' },
      destinationToken: { symbol: 'USDC', chain: 'BASE' },
    });
  });

  it('returns xdr for native fee method', async () => {
    setupSdkSuccess();
    const res = await POST(
      makeReq({
        amount: '10',
        fromAddress: VALID_STELLAR,
        toAddress: VALID_BASE,
        feePaymentMethod: 'native',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.xdr).toBe('FAKE_XDR_STRING');
  });

  it('defaults to stablecoin fee when feePaymentMethod is omitted', async () => {
    setupSdkSuccess();
    const res = await POST(
      makeReq({ amount: '10', fromAddress: VALID_STELLAR, toAddress: VALID_BASE }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid amount', async () => {
    vi.mocked(validation.validateAmount).mockReturnValue(false);
    const res = await POST(
      makeReq({ amount: '-5', fromAddress: VALID_STELLAR, toAddress: VALID_BASE }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/amount/i);
  });

  it('returns 400 for invalid Stellar address', async () => {
    vi.mocked(validation.validateAmount).mockReturnValue(true);
    vi.mocked(validation.validateAddress).mockImplementation((_addr, chain) => chain !== 'stellar');
    const res = await POST(
      makeReq({ amount: '10', fromAddress: 'bad-addr', toAddress: VALID_BASE }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/stellar/i);
  });

  it('returns 400 for invalid Base address', async () => {
    vi.mocked(validation.validateAmount).mockReturnValue(true);
    vi.mocked(validation.validateAddress).mockImplementation((_addr, chain) => chain !== 'base');
    const res = await POST(
      makeReq({ amount: '10', fromAddress: VALID_STELLAR, toAddress: 'bad-addr' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/base/i);
  });

  it('returns 400 for invalid feePaymentMethod', async () => {
    vi.mocked(validation.validateAmount).mockReturnValue(true);
    vi.mocked(validation.validateAddress).mockReturnValue(true);
    const res = await POST(
      makeReq({
        amount: '10',
        fromAddress: VALID_STELLAR,
        toAddress: VALID_BASE,
        feePaymentMethod: 'bitcoin',
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/feePaymentMethod/i);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(rateLimiter.buildTxLimiter.check).mockReturnValueOnce({
      allowed: false,
      retryAfter: 60,
    } as any);
    const res = await POST(
      makeReq({ amount: '10', fromAddress: VALID_STELLAR, toAddress: VALID_BASE }),
    );
    expect(res.status).toBe(429);
  });

  it('returns 500 when chain details are unavailable', async () => {
    vi.mocked(validation.validateAmount).mockReturnValue(true);
    vi.mocked(validation.validateAddress).mockReturnValue(true);
    mockChainDetailsMap.mockResolvedValue({});
    const res = await POST(
      makeReq({ amount: '10', fromAddress: VALID_STELLAR, toAddress: VALID_BASE }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/chain details/i);
  });

  it('returns 500 with user-friendly message for insufficient balance error', async () => {
    setupSdkSuccess();
    mockSend.mockRejectedValue(new Error('resulting balance is not within the allowed range'));
    const res = await POST(
      makeReq({ amount: '10', fromAddress: VALID_STELLAR, toAddress: VALID_BASE }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/xlm/i);
  });
});
