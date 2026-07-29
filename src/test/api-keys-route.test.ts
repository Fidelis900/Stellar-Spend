import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createApiKeyMock = vi.fn();
const listApiKeysMock = vi.fn();
const rotateApiKeyMock = vi.fn();
const revokeApiKeyMock = vi.fn();
const listApiKeyUsageMock = vi.fn();

vi.mock('@/lib/api-keys/service', () => ({
  createApiKey: createApiKeyMock,
  listApiKeys: listApiKeysMock,
  rotateApiKey: rotateApiKeyMock,
  revokeApiKey: revokeApiKeyMock,
  listApiKeyUsage: listApiKeyUsageMock,
  hasApiKeyAdminToken: () => true,
  isValidAdminToken: (token: string | null) => token === 'admin-token',
}));

import { GET as listGET, POST as createPOST } from '@/app/api/api-keys/route';
import { POST as rotatePOST } from '@/app/api/api-keys/[id]/rotate/route';
import { POST as revokePOST } from '@/app/api/api-keys/[id]/revoke/route';
import { GET as usageGET } from '@/app/api/api-keys/[id]/usage/route';

function makeRequest(url: string, method: string, body?: object) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      Authorization: 'Bearer admin-token',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('api key management routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new API key', async () => {
    createApiKeyMock.mockResolvedValue({
      id: 'key_1',
      name: 'Partner',
      keyPrefix: 'abc123',
      status: 'active',
      plaintextKey: 'ssp_live_abc.secret',
    });

    const response = await createPOST(makeRequest('/api/api-keys', 'POST', { name: 'Partner' }));

    expect(response.status).toBe(201);
    expect((await response.json()).data.plaintextKey).toMatch(/^ssp_live_/);
  });

  it('lists API keys', async () => {
    listApiKeysMock.mockResolvedValue([{ id: 'key_1', name: 'Partner', status: 'active' }]);
    const response = await listGET(makeRequest('/api/api-keys', 'GET'));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toHaveLength(1);
  });

  it('rotates and revokes API keys', async () => {
    rotateApiKeyMock.mockResolvedValue({ id: 'key_2', plaintextKey: 'ssp_live_new.secret' });
    revokeApiKeyMock.mockResolvedValue({ id: 'key_1', status: 'revoked' });
    listApiKeyUsageMock.mockResolvedValue([{ id: 'usage_1', apiKeyId: 'key_1' }]);

    const rotateResponse = await rotatePOST(makeRequest('/api/api-keys/key_1/rotate', 'POST'), {
      params: Promise.resolve({ id: 'key_1' }),
    });
    expect(rotateResponse.status).toBe(200);

    const revokeResponse = await revokePOST(
      makeRequest('/api/api-keys/key_1/revoke', 'POST', { reason: 'compromised' }),
      { params: Promise.resolve({ id: 'key_1' }) },
    );
    expect(revokeResponse.status).toBe(200);

    const usageResponse = await usageGET(makeRequest('/api/api-keys/key_1/usage', 'GET'), {
      params: Promise.resolve({ id: 'key_1' }),
    });
    expect(usageResponse.status).toBe(200);
    expect((await usageResponse.json()).data).toHaveLength(1);
  });
});
