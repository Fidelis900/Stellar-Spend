import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQueryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  pool: {
    query: poolQueryMock,
  },
}));

import {
  authenticateApiKey,
  checkApiKeyRateLimit,
  createApiKey,
  isValidAdminToken,
} from '@/lib/api-keys';

describe('api key service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_KEY_ADMIN_TOKEN = 'admin-secret';
  });

  it('validates the admin token', () => {
    expect(isValidAdminToken('admin-secret')).toBe(true);
    expect(isValidAdminToken('wrong-secret')).toBe(false);
  });

  it('creates a plaintext key and stores only hashed metadata', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'key_1',
          name: 'Partner',
          key_prefix: 'abc123',
          status: 'active',
          rate_limit_max_requests: 120,
          rate_limit_window_ms: 60000,
          usage_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    });

    const result = await createApiKey({ name: 'Partner', rateLimitMaxRequests: 120 });

    expect(result.plaintextKey).toMatch(/^ssp_live_/);
    expect(result.status).toBe('active');
    expect(poolQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_keys'),
      expect.arrayContaining(['Partner', 120]),
    );
  });

  it('authenticates only active, non-expired keys', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'key_1',
          name: 'Partner',
          key_prefix: 'abc123',
          status: 'active',
          rate_limit_max_requests: 60,
          rate_limit_window_ms: 60000,
          usage_count: 2,
          expires_at: Date.now() + 60_000,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    });

    const authenticated = await authenticateApiKey('ssp_live_abc.def');
    expect(authenticated?.id).toBe('key_1');

    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'key_2',
          name: 'Old Partner',
          key_prefix: 'def456',
          status: 'revoked',
          rate_limit_max_requests: 60,
          rate_limit_window_ms: 60000,
          usage_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    });

    const revoked = await authenticateApiKey('ssp_live_def.ghi');
    expect(revoked).toBeNull();
  });

  it('enforces per-key rate limits in memory', () => {
    const apiKey = {
      id: 'key_1',
      name: 'Partner',
      keyPrefix: 'abc123',
      status: 'active' as const,
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60_000,
      usageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(checkApiKeyRateLimit(apiKey).allowed).toBe(true);
    expect(checkApiKeyRateLimit(apiKey).allowed).toBe(false);
  });
});
