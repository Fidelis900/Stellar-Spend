import { logger } from '@/lib/logger';
/**
 * Enhanced rate limiter with:
 * - User-based and IP-based limiting
 * - Sliding window algorithm
 * - Redis storage (in-memory fallback)
 * - Premium user bypass
 * - Rate limit headers
 * - Violation logging
 */

import { getCacheClient } from '../../cache/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  /** If true, premium users bypass this limiter */
  premiumBypass?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp (ms)
  retryAfter?: number; // seconds
}

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'Retry-After'?: string;
}

// ─── Sliding Window Rate Limiter ──────────────────────────────────────────────

export class SlidingWindowRateLimiter {
  private config: RateLimitConfig;
  private namespace: string;

  constructor(namespace: string, config: RateLimitConfig) {
    this.namespace = namespace;
    this.config = config;
  }

  /**
   * Check and increment the rate limit for a given key.
   * Uses a sliding window stored as a sorted set (timestamps) in Redis,
   * or a simple counter with expiry in the in-memory fallback.
   */
  async check(key: string, options?: { isPremium?: boolean }): Promise<RateLimitResult> {
    // Premium bypass
    if (options?.isPremium && this.config.premiumBypass) {
      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetAt: Date.now() + this.config.windowMs,
      };
    }

    const storeKey = `rl:${this.namespace}:${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const resetAt = now + this.config.windowMs;

    const client = getCacheClient();

    // Use JSON-encoded sliding window stored as a list of timestamps
    const raw = await client.get(storeKey);
    let timestamps: number[] = raw ? (JSON.parse(raw) as number[]) : [];

    // Remove timestamps outside the current window
    timestamps = timestamps.filter((t) => t > windowStart);

    const count = timestamps.length;
    const remaining = Math.max(0, this.config.maxRequests - count);

    if (count >= this.config.maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + this.config.windowMs - now;
      const retryAfter = Math.ceil(retryAfterMs / 1000);

      logViolation(this.namespace, key, count, this.config.maxRequests);

      return {
        allowed: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetAt: oldestInWindow + this.config.windowMs,
        retryAfter,
      };
    }

    // Add current timestamp and persist
    timestamps.push(now);
    const ttlSeconds = Math.ceil(this.config.windowMs / 1000);
    await client.set(storeKey, JSON.stringify(timestamps), ttlSeconds);

    return {
      allowed: true,
      limit: this.config.maxRequests,
      remaining: remaining - 1,
      resetAt,
    };
  }

  /** Reset the rate limit for a specific key */
  async reset(key: string): Promise<void> {
    await getCacheClient().del(`rl:${this.namespace}:${key}`);
  }
}

// ─── Violation Logging ────────────────────────────────────────────────────────

function logViolation(namespace: string, key: string, count: number, limit: number): void {
  logger.warn(
    JSON.stringify({
      event: 'rate_limit.violation',
      timestamp: new Date().toISOString(),
      namespace,
      key,
      count,
      limit,
    }),
  );
}

// ─── Header Helpers ───────────────────────────────────────────────────────────

export function getRateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = String(result.retryAfter);
  }
  return headers;
}

// ─── Key Extraction ───────────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

export function getUserId(request: Request): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return `user:${auth.slice(7, 15)}`;
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) return `apikey:${apiKey.slice(0, 8)}`;
  return null;
}

/** Returns the best available rate limit key: userId if present, else IP */
export function getRateLimitKey(request: Request): string {
  return getUserId(request) ?? getClientIp(request);
}

// ─── Pre-configured Limiters ──────────────────────────────────────────────────

export const buildTxLimiter = new SlidingWindowRateLimiter('build-tx', {
  maxRequests: 10,
  windowMs: 60_000,
  premiumBypass: false,
});

export const paycrestOrderLimiter = new SlidingWindowRateLimiter('paycrest-order', {
  maxRequests: 5,
  windowMs: 60_000,
  premiumBypass: true,
});

export const quoteLimiter = new SlidingWindowRateLimiter('quote', {
  maxRequests: 30,
  windowMs: 60_000,
  premiumBypass: true,
});

export const globalApiLimiter = new SlidingWindowRateLimiter('global', {
  maxRequests: 100,
  windowMs: 60_000,
  premiumBypass: true,
});
