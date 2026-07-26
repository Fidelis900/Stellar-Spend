/**
 * Unit tests for the centralized rate limiter service — #794
 *
 * Covers:
 *  - SlidingWindowRateLimiter allows requests under the limit
 *  - SlidingWindowRateLimiter blocks requests over the limit
 *  - Window reset evicts expired timestamps
 *  - Premium bypass
 *  - retryAfter is set when blocked
 *  - getRateLimitKey prefers userId/apiKey over IP
 *  - getClientIp parses x-forwarded-for correctly
 *  - getRateLimitHeaders includes required headers
 *  - applyRateLimit returns null when allowed, 429 when blocked
 *  - RATE_LIMIT_REGISTRY covers all sensitive namespaces
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SlidingWindowRateLimiter,
  RATE_LIMIT_REGISTRY,
  getRateLimitKey,
  getClientIp,
  getRateLimitHeaders,
  applyRateLimit,
  type RateLimitConfig,
} from '@/lib/rateLimiter';
import { NextRequest } from 'next/server';

// ── In-memory cache mock ──────────────────────────────────────────────────────

const cacheStore = new Map<string, string>();

vi.mock('@/lib/cache/client', () => ({
  getCacheClient: () => ({
    get: async (key: string) => cacheStore.get(key) ?? null,
    set: async (key: string, value: string) => { cacheStore.set(key, value); },
    del: async (key: string) => { cacheStore.delete(key); },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLimiter(config: Partial<RateLimitConfig> = {}): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter('test-ns', {
    maxRequests: 3,
    windowMs: 60_000,
    ...config,
  });
}

function makeRequest(
  opts: { ip?: string; bearer?: string; apiKey?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`;
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;
  return new NextRequest('http://localhost/api/test', { headers });
}

// ── SlidingWindowRateLimiter — allow under limit ──────────────────────────────

describe('SlidingWindowRateLimiter — allowed under limit', () => {
  beforeEach(() => cacheStore.clear());

  it('allows the first request', async () => {
    const limiter = makeLimiter({ maxRequests: 3 });
    const result = await limiter.check('key_a');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(2);
  });

  it('allows exactly maxRequests requests in one window', async () => {
    const limiter = makeLimiter({ maxRequests: 3 });
    for (let i = 0; i < 3; i++) {
      expect((await limiter.check('key_b')).allowed).toBe(true);
    }
  });

  it('remaining decrements with each request', async () => {
    const limiter = makeLimiter({ maxRequests: 5 });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await limiter.check('key_c'));
    expect(results[0].remaining).toBe(4);
    expect(results[4].remaining).toBe(0);
  });

  it('different keys are tracked independently', async () => {
    const limiter = makeLimiter({ maxRequests: 1 });
    const r1 = await limiter.check('key_x');
    const r2 = await limiter.check('key_y');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});

// ── SlidingWindowRateLimiter — block over limit ───────────────────────────────

describe('SlidingWindowRateLimiter — blocked over limit', () => {
  beforeEach(() => cacheStore.clear());

  it('blocks the (maxRequests+1)th request', async () => {
    const limiter = makeLimiter({ maxRequests: 2 });
    await limiter.check('key_blk');
    await limiter.check('key_blk');
    const blocked = await limiter.check('key_blk');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('sets retryAfter (seconds) when blocked', async () => {
    const limiter = makeLimiter({ maxRequests: 1, windowMs: 30_000 });
    await limiter.check('key_retry');
    const blocked = await limiter.check('key_retry');
    expect(blocked.retryAfter).toBeDefined();
    expect(blocked.retryAfter!).toBeGreaterThan(0);
    expect(blocked.retryAfter!).toBeLessThanOrEqual(30);
  });
});

// ── SlidingWindowRateLimiter — reset ─────────────────────────────────────────

describe('SlidingWindowRateLimiter — reset clears counter', () => {
  beforeEach(() => cacheStore.clear());

  it('allows requests again after reset', async () => {
    const limiter = makeLimiter({ maxRequests: 1 });
    await limiter.check('key_rst');
    expect((await limiter.check('key_rst')).allowed).toBe(false);

    await limiter.reset('key_rst');
    expect((await limiter.check('key_rst')).allowed).toBe(true);
  });
});

// ── SlidingWindowRateLimiter — premium bypass ─────────────────────────────────

describe('SlidingWindowRateLimiter — premium bypass', () => {
  beforeEach(() => cacheStore.clear());

  it('bypasses the limit when premiumBypass=true and isPremium=true', async () => {
    const limiter = makeLimiter({ maxRequests: 1, premiumBypass: true });
    await limiter.check('key_prem'); // exhaust
    const r = await limiter.check('key_prem', { isPremium: true });
    expect(r.allowed).toBe(true);
  });

  it('does NOT bypass when premiumBypass=false', async () => {
    const limiter = makeLimiter({ maxRequests: 1, premiumBypass: false });
    await limiter.check('key_noprem');
    const r = await limiter.check('key_noprem', { isPremium: true });
    expect(r.allowed).toBe(false);
  });
});

// ── SlidingWindowRateLimiter — namespace isolation ────────────────────────────

describe('SlidingWindowRateLimiter — namespace isolation', () => {
  beforeEach(() => cacheStore.clear());

  it('two limiters with different namespaces track independently', async () => {
    const la = new SlidingWindowRateLimiter('ns_a', { maxRequests: 1, windowMs: 60_000 });
    const lb = new SlidingWindowRateLimiter('ns_b', { maxRequests: 1, windowMs: 60_000 });
    expect((await la.check('shared')).allowed).toBe(true);
    expect((await lb.check('shared')).allowed).toBe(true);
    expect((await la.check('shared')).allowed).toBe(false);
    expect((await lb.check('shared')).allowed).toBe(false);
  });
});

// ── getRateLimitKey ───────────────────────────────────────────────────────────

describe('getRateLimitKey', () => {
  it('prefers Bearer token over IP', () => {
    const req = makeRequest({ bearer: 'tok_abc123xyz', ip: '1.2.3.4' });
    expect(getRateLimitKey(req)).toBe('user:tok_abc1');
  });

  it('uses api key prefix when no bearer token', () => {
    const req = makeRequest({ apiKey: 'ssp_live_abcdef1234567890' });
    expect(getRateLimitKey(req)).toBe('apikey:ssp_live');
  });

  it('falls back to IP when no auth headers', () => {
    const req = makeRequest({ ip: '192.168.1.100' });
    expect(getRateLimitKey(req)).toBe('192.168.1.100');
  });

  it('returns "unknown" when there are no identifying headers', () => {
    const req = makeRequest({});
    expect(getRateLimitKey(req)).toBe('unknown');
  });
});

// ── getClientIp ───────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  it('parses first IP from x-forwarded-for chain', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' },
    });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('falls back to x-real-ip', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { 'x-real-ip': '172.16.0.1' },
    });
    expect(getClientIp(req)).toBe('172.16.0.1');
  });

  it('returns "unknown" when no IP headers present', () => {
    const req = new NextRequest('http://localhost/');
    expect(getClientIp(req)).toBe('unknown');
  });
});

// ── getRateLimitHeaders ───────────────────────────────────────────────────────

describe('getRateLimitHeaders', () => {
  it('returns X-RateLimit-Limit, -Remaining, and -Reset', () => {
    const h = getRateLimitHeaders({ allowed: true, limit: 30, remaining: 15, resetAt: 1_700_000_060_000 });
    expect(h['X-RateLimit-Limit']).toBe('30');
    expect(h['X-RateLimit-Remaining']).toBe('15');
    expect(h['X-RateLimit-Reset']).toBeDefined();
  });

  it('includes Retry-After when retryAfter is provided', () => {
    const h = getRateLimitHeaders({ allowed: false, limit: 5, remaining: 0, resetAt: 1_700_000_060_000, retryAfter: 45 });
    expect(h['Retry-After']).toBe('45');
  });

  it('omits Retry-After when request is allowed', () => {
    const h = getRateLimitHeaders({ allowed: true, limit: 5, remaining: 4, resetAt: 1_700_000_060_000 });
    expect(h['Retry-After']).toBeUndefined();
  });
});

// ── applyRateLimit ────────────────────────────────────────────────────────────

describe('applyRateLimit', () => {
  beforeEach(() => cacheStore.clear());

  it('returns null when request is within the limit', async () => {
    const req = makeRequest({ ip: '5.5.5.5' });
    expect(await applyRateLimit(req, 'quote')).toBeNull();
  });

  it('returns null for unknown namespace (no config = no limit)', async () => {
    const req = makeRequest({ ip: '9.9.9.9' });
    expect(await applyRateLimit(req, 'non-existent')).toBeNull();
  });

  it('returns 429 NextResponse when limit is exceeded', async () => {
    const namespace = 'paycrest-order';
    const config = RATE_LIMIT_REGISTRY[namespace];
    const storeKey = `rl:${namespace}:blocked_test_ip`;
    // Pre-fill window with maxRequests timestamps
    cacheStore.set(storeKey, JSON.stringify(Array.from({ length: config.maxRequests }, () => Date.now())));

    const req = makeRequest({ ip: 'blocked_test_ip' });
    const response = await applyRateLimit(req, namespace);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
  });

  it('429 response body has TOO_MANY_REQUESTS error code', async () => {
    const namespace = 'build-tx';
    const config = RATE_LIMIT_REGISTRY[namespace];
    const storeKey = `rl:${namespace}:another_blocked_ip`;
    cacheStore.set(storeKey, JSON.stringify(Array.from({ length: config.maxRequests }, () => Date.now())));

    const req = makeRequest({ ip: 'another_blocked_ip' });
    const response = await applyRateLimit(req, namespace);
    const body = await response!.json();
    expect(body.error).toBe('TOO_MANY_REQUESTS');
    expect(body.message).toMatch(/Rate limit exceeded/i);
  });
});

// ── RATE_LIMIT_REGISTRY completeness ─────────────────────────────────────────

describe('RATE_LIMIT_REGISTRY — all required namespaces present', () => {
  const required = [
    'build-tx',
    'paycrest-order',
    'quote',
    'global',
    'transactions-read',
    'transactions-write',
    'auth-2fa',
    'offramp-status',
  ];

  for (const ns of required) {
    it(`has config for "${ns}"`, () => {
      expect(RATE_LIMIT_REGISTRY[ns]).toBeDefined();
      expect(RATE_LIMIT_REGISTRY[ns].maxRequests).toBeGreaterThan(0);
      expect(RATE_LIMIT_REGISTRY[ns].windowMs).toBeGreaterThan(0);
    });
  }

  it('auth-2fa is stricter than transactions-read', () => {
    expect(RATE_LIMIT_REGISTRY['auth-2fa'].maxRequests).toBeLessThan(
      RATE_LIMIT_REGISTRY['transactions-read'].maxRequests,
    );
  });

  it('paycrest-order has a tight limit (≤ 5)', () => {
    expect(RATE_LIMIT_REGISTRY['paycrest-order'].maxRequests).toBeLessThanOrEqual(5);
  });
});
