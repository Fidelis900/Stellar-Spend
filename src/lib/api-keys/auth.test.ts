import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const authenticateApiKeyMock = vi.fn();
const checkApiKeyRateLimitMock = vi.fn();
const recordApiKeyUsageMock = vi.fn();

vi.mock('@/lib/api-keys/service', () => ({
  authenticateApiKey: authenticateApiKeyMock,
  checkApiKeyRateLimit: checkApiKeyRateLimitMock,
  recordApiKeyUsage: recordApiKeyUsageMock,
}));

vi.mock('@/lib/offramp/utils/rate-limiter', () => ({
  getClientIp: () => '127.0.0.1',
}));

import { withApiKeyAuth } from '@/lib/api-keys';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/v1/offramp/quote', {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: '10', currency: 'NGN' }),
  });
}

describe('withApiKeyAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the API key is missing', async () => {
    const response = await withApiKeyAuth(makeRequest(), async () =>
      NextResponse.json({ ok: true }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 429 when the key rate limit is exceeded', async () => {
    authenticateApiKeyMock.mockResolvedValue({
      id: 'key_1',
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60000,
    });
    checkApiKeyRateLimitMock.mockReturnValue({ allowed: false, retryAfter: 42 });

    const response = await withApiKeyAuth(
      makeRequest({ 'x-api-key': 'ssp_live_test.secret' }),
      async () => NextResponse.json({ ok: true }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(recordApiKeyUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: 'key_1', limited: true, statusCode: 429 }),
    );
  });

  it('calls the handler and records usage for a valid key', async () => {
    authenticateApiKeyMock.mockResolvedValue({
      id: 'key_1',
      rateLimitMaxRequests: 10,
      rateLimitWindowMs: 60000,
    });
    checkApiKeyRateLimitMock.mockReturnValue({ allowed: true });

    const response = await withApiKeyAuth(
      makeRequest({ authorization: 'Bearer ssp_live_test.secret' }),
      async () => NextResponse.json({ ok: true }, { status: 200 }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Key-Id')).toBe('key_1');
    expect(recordApiKeyUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: 'key_1', limited: false, statusCode: 200 }),
    );
  });
});
