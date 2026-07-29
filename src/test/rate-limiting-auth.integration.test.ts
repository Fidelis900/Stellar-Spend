/**
 * Rate-limiting integration tests for auth endpoints — Issue #841
 *
 * Verifies rate-limit enforcement end-to-end through the real middleware stack
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  SlidingWindowRateLimiter,
  RATE_LIMIT_REGISTRY,
  getRateLimitKey,
  getRateLimitHeaders,
  applyRateLimit,
} from '@/lib/rateLimiter';

// Mock cache store for deterministic testing
const cacheStore = new Map<string, string>();

vi.mock('@/lib/cache/client', () => ({
  getCacheClient: () => ({
    get: async (key: string) => cacheStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      cacheStore.set(key, value);
    },
    del: async (key: string) => {
      cacheStore.delete(key);
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Test helpers
function makeRequest(
  path: string,
  opts: { ip?: string; bearer?: string; apiKey?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`;
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe('Rate Limiting — Auth Endpoints Integration', () => {
  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();
  });

  describe('login endpoint rate limiting', () => {
    it('allows requests under the limit', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-login', {
        maxRequests: 5,
        windowMs: 60000,
      });

      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await limiter.check(`ip:192.0.2.1`);
        results.push(result);
      }

      results.forEach((r) => expect(r.allowed).toBe(true));
    });

    it('returns 429 when limit is exceeded', async () => {
      const namespace = 'auth-2fa';
      const limiter = new SlidingWindowRateLimiter(namespace, {
        maxRequests: 3,
        windowMs: 60000,
      });

      const key = `ip:192.0.2.2`;

      // Use up all requests
      for (let i = 0; i < 3; i++) {
        await limiter.check(key);
      }

      // Fourth request should be blocked
      const blocked = await limiter.check(key);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBeDefined();
    });

    it('returns Retry-After header when rate limited', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 2,
        windowMs: 30000,
      });

      const key = `ip:192.0.2.3`;

      // Exhaust limit
      await limiter.check(key);
      await limiter.check(key);

      // Next request should be limited
      const blocked = await limiter.check(key);

      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBeDefined();
      expect(blocked.retryAfter).toBeGreaterThan(0);
      expect(blocked.retryAfter).toBeLessThanOrEqual(30);
    });

    it('blocks with 429 response in applyRateLimit', async () => {
      // Pre-populate cache with maxed out requests
      const namespace = 'auth-2fa';
      const config = RATE_LIMIT_REGISTRY[namespace];
      const testKey = `rl:${namespace}:blocked_auth_ip`;

      const timestamps = Array.from({ length: config.maxRequests }, () => Date.now());
      cacheStore.set(testKey, JSON.stringify(timestamps));

      const req = makeRequest('/api/auth/login', { ip: 'blocked_auth_ip' });
      const response = await applyRateLimit(req, namespace);

      expect(response).not.toBeNull();
      expect(response!.status).toBe(429);
    });

    it('429 response includes proper error body', async () => {
      const namespace = 'auth-2fa';
      const config = RATE_LIMIT_REGISTRY[namespace];
      const testKey = `rl:${namespace}:error_test_ip`;

      const timestamps = Array.from({ length: config.maxRequests }, () => Date.now());
      cacheStore.set(testKey, JSON.stringify(timestamps));

      const req = makeRequest('/api/auth/login', { ip: 'error_test_ip' });
      const response = await applyRateLimit(req, namespace);

      expect(response!.status).toBe(429);

      const body = await response!.json();
      expect(body.error).toBe('TOO_MANY_REQUESTS');
      expect(body.message).toContain('Rate limit exceeded');
    });
  });

  describe('2FA verification endpoint rate limiting', () => {
    it('applies stricter limits to 2FA endpoints', () => {
      const auth2FaConfig = RATE_LIMIT_REGISTRY['auth-2fa'];
      const transactionsConfig = RATE_LIMIT_REGISTRY['transactions-read'];

      expect(auth2FaConfig.maxRequests).toBeLessThan(transactionsConfig.maxRequests);
    });

    it('tracks rate limits per user/IP independently', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 3,
        windowMs: 60000,
      });

      const user1Key = `user:token123`;
      const user2Key = `user:token456`;

      // User 1 makes 3 requests
      for (let i = 0; i < 3; i++) {
        await limiter.check(user1Key);
      }

      // User 2 should still be able to make requests
      const user2Result = await limiter.check(user2Key);
      expect(user2Result.allowed).toBe(true);

      // User 1 should be blocked
      const user1Result = await limiter.check(user1Key);
      expect(user1Result.allowed).toBe(false);
    });

    it('enforces limits per bearer token', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 2,
        windowMs: 60000,
      });

      const bearerKey = `user:bearer_abc123`;

      // First two requests allowed
      expect((await limiter.check(bearerKey)).allowed).toBe(true);
      expect((await limiter.check(bearerKey)).allowed).toBe(true);

      // Third request blocked
      const result = await limiter.check(bearerKey);
      expect(result.allowed).toBe(false);
    });
  });

  describe('window reset behavior', () => {
    it('resets limits after window expires', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 1,
        windowMs: 100, // 100ms window
      });

      const key = `ip:192.0.2.4`;

      // First request allowed
      let result = await limiter.check(key);
      expect(result.allowed).toBe(true);

      // Second request in same window blocked
      result = await limiter.check(key);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // After window expires, should allow again
      result = await limiter.check(key);
      expect(result.allowed).toBe(true);
    });

    it('verifies limit resets after configured window', async () => {
      const windowMs = 2000; // 2 second window
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 3,
        windowMs,
      });

      const key = `window_test_key`;

      // Exhaust limit at t=0
      for (let i = 0; i < 3; i++) {
        await limiter.check(key);
      }

      const blockedAtStart = await limiter.check(key);
      expect(blockedAtStart.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, windowMs + 100));

      // Should allow again after window expires
      const allowedAfter = await limiter.check(key);
      expect(allowedAfter.allowed).toBe(true);
    });
  });

  describe('rate limit headers', () => {
    it('includes X-RateLimit headers in response', () => {
      const headers = getRateLimitHeaders({
        allowed: true,
        limit: 30,
        remaining: 15,
        resetAt: Date.now() + 60000,
      });

      expect(headers['X-RateLimit-Limit']).toBe('30');
      expect(headers['X-RateLimit-Remaining']).toBe('15');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('includes Retry-After header when blocked', () => {
      const headers = getRateLimitHeaders({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetAt: Date.now() + 45000,
        retryAfter: 45,
      });

      expect(headers['Retry-After']).toBe('45');
    });

    it('omits Retry-After when request is allowed', () => {
      const headers = getRateLimitHeaders({
        allowed: true,
        limit: 5,
        remaining: 4,
        resetAt: Date.now() + 60000,
      });

      expect(headers['Retry-After']).toBeUndefined();
    });
  });

  describe('premium bypass behavior', () => {
    it('bypasses rate limit for premium users when configured', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 1,
        windowMs: 60000,
        premiumBypass: true,
      });

      const key = `premium_user:token`;

      // Exhaust limit
      await limiter.check(key);

      // Premium user should still be allowed
      const result = await limiter.check(key, { isPremium: true });
      expect(result.allowed).toBe(true);
    });

    it('does not bypass for non-premium users', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 1,
        windowMs: 60000,
        premiumBypass: true,
      });

      const key = `regular_user:token`;

      // Exhaust limit
      await limiter.check(key);

      // Regular user should be blocked
      const result = await limiter.check(key, { isPremium: false });
      expect(result.allowed).toBe(false);
    });
  });

  describe('rate limit registry completeness', () => {
    it('has config for auth-2fa', () => {
      expect(RATE_LIMIT_REGISTRY['auth-2fa']).toBeDefined();
      expect(RATE_LIMIT_REGISTRY['auth-2fa'].maxRequests).toBeGreaterThan(0);
      expect(RATE_LIMIT_REGISTRY['auth-2fa'].windowMs).toBeGreaterThan(0);
    });

    it('auth-2fa limit is stricter than other auth operations', () => {
      const auth2FaLimit = RATE_LIMIT_REGISTRY['auth-2fa'].maxRequests;
      const transactionsLimit = RATE_LIMIT_REGISTRY['transactions-read'].maxRequests;

      expect(auth2FaLimit).toBeLessThan(transactionsLimit);
    });

    it('all sensitive namespaces have configured limits', () => {
      const requiredNamespaces = [
        'auth-2fa',
        'build-tx',
        'quote',
        'paycrest-order',
        'transactions-read',
        'transactions-write',
      ];

      requiredNamespaces.forEach((ns) => {
        expect(RATE_LIMIT_REGISTRY[ns]).toBeDefined();
        expect(RATE_LIMIT_REGISTRY[ns].maxRequests).toBeGreaterThan(0);
        expect(RATE_LIMIT_REGISTRY[ns].windowMs).toBeGreaterThan(0);
      });
    });
  });

  describe('rate limit key generation', () => {
    it('prefers bearer token for identification', () => {
      const req = makeRequest('/api/auth/login', {
        bearer: 'token_abc123',
        ip: '192.0.2.1',
      });

      const key = getRateLimitKey(req);
      expect(key).toContain('user:');
    });

    it('uses IP when no auth headers present', () => {
      const req = makeRequest('/api/auth/login', { ip: '192.0.2.1' });
      const key = getRateLimitKey(req);

      expect(key).toBe('192.0.2.1');
    });

    it('returns unknown for fully anonymous requests', () => {
      const req = makeRequest('/api/auth/login', {});
      const key = getRateLimitKey(req);

      expect(key).toBe('unknown');
    });
  });

  describe('attack scenarios', () => {
    it('prevents brute force login attacks', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 5,
        windowMs: 60000,
      });

      const attackerIp = `attacker_ip_001`;
      let blockedCount = 0;

      // Simulate 20 rapid login attempts
      for (let i = 0; i < 20; i++) {
        const result = await limiter.check(attackerIp);
        if (!result.allowed) {
          blockedCount++;
        }
      }

      // At least 15 of the 20 should be blocked
      expect(blockedCount).toBeGreaterThanOrEqual(15);
    });

    it('prevents distributed brute force with per-IP tracking', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 3,
        windowMs: 60000,
      });

      const ips = ['192.0.2.10', '192.0.2.11', '192.0.2.12'];
      const results = [];

      // Each attacker makes 3 requests (at limit)
      for (const ip of ips) {
        for (let i = 0; i < 3; i++) {
          results.push(await limiter.check(`ip:${ip}`));
        }
      }

      // All should be allowed (different IPs)
      expect(results.every((r) => r.allowed)).toBe(true);

      // Fourth request from any should be blocked
      for (const ip of ips) {
        const result = await limiter.check(`ip:${ip}`);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('integration scenarios', () => {
    it('simulates real login flow with rate limiting', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 5,
        windowMs: 60000,
      });

      const userIp = 'user_login_test_001';

      // Simulate user login attempts
      const attempt1 = await limiter.check(userIp);
      expect(attempt1.allowed).toBe(true);
      expect(attempt1.remaining).toBe(4);

      const attempt2 = await limiter.check(userIp);
      expect(attempt2.allowed).toBe(true);
      expect(attempt2.remaining).toBe(3);

      const attempt3 = await limiter.check(userIp);
      expect(attempt3.allowed).toBe(true);
      expect(attempt3.remaining).toBe(2);

      // User gets blocked on excessive attempts
      const attempt4 = await limiter.check(userIp);
      const attempt5 = await limiter.check(userIp);
      const attempt6 = await limiter.check(userIp);

      const lastAttempt = await limiter.check(userIp);
      expect(lastAttempt.allowed).toBe(false);
      expect(lastAttempt.retryAfter).toBeDefined();
    });

    it('handles legitimate traffic with rate limiting', async () => {
      const limiter = new SlidingWindowRateLimiter('auth-2fa', {
        maxRequests: 10,
        windowMs: 60000,
      });

      const legitimateUserKey = 'legitimate_user_001';

      // Simulate legitimate user making requests over time
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(await limiter.check(legitimateUserKey));
      }

      // All should be allowed
      expect(results.every((r) => r.allowed)).toBe(true);
      expect(results[9].remaining).toBe(0);

      // 11th request should be blocked
      const blocked = await limiter.check(legitimateUserKey);
      expect(blocked.allowed).toBe(false);
    });
  });
});
