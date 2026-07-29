/**
 * Rate limiting configuration and utilities
 * Provides granular rate limiting for different endpoints
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  statusCode?: number;
}

export interface RateLimitStore {
  get(key: string): Promise<number>;
  set(key: string, value: number, ttl: number): Promise<void>;
  increment(key: string, ttl: number): Promise<number>;
  reset(key: string): Promise<void>;
}

/**
 * In-memory rate limit store (suitable for single-instance deployments)
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();

  async get(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    if (Date.now() > entry.resetTime) {
      this.store.delete(key);
      return 0;
    }
    return entry.count;
  }

  async set(key: string, value: number, ttl: number): Promise<void> {
    this.store.set(key, {
      count: value,
      resetTime: Date.now() + ttl,
    });
  }

  async increment(key: string, ttl: number): Promise<number> {
    const current = await this.get(key);
    const newCount = current + 1;
    await this.set(key, newCount, ttl);
    return newCount;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Public endpoints - strict limits
  '/api/offramp/quote': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  '/api/offramp/currencies': {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
  '/api/offramp/rate': {
    windowMs: 10 * 1000, // 10 seconds
    maxRequests: 10,
  },

  // Bridge endpoints - moderate limits
  '/api/offramp/bridge/build-tx': {
    windowMs: 60 * 1000,
    maxRequests: 20,
  },
  '/api/offramp/bridge/submit-soroban': {
    windowMs: 60 * 1000,
    maxRequests: 10,
  },
  '/api/offramp/bridge/status': {
    windowMs: 10 * 1000,
    maxRequests: 30,
  },

  // Payout endpoints - strict limits
  '/api/offramp/paycrest/order': {
    windowMs: 60 * 1000,
    maxRequests: 5,
  },
  '/api/offramp/execute-payout': {
    windowMs: 60 * 1000,
    maxRequests: 5,
  },
  '/api/offramp/status': {
    windowMs: 10 * 1000,
    maxRequests: 30,
  },

  // Webhook endpoints - no rate limit (use signature verification instead)
  '/api/webhooks/paycrest': {
    windowMs: 60 * 1000,
    maxRequests: 1000, // Very high limit for webhooks
  },

  // Health check - no rate limit
  '/api/health': {
    windowMs: 60 * 1000,
    maxRequests: 1000,
  },
};

/**
 * Get rate limit config for an endpoint
 */
export function getRateLimitConfig(endpoint: string): RateLimitConfig | null {
  // Exact match
  if (RATE_LIMIT_CONFIGS[endpoint]) {
    return RATE_LIMIT_CONFIGS[endpoint];
  }

  // Pattern match (e.g., /api/offramp/bridge/status/[hash])
  for (const [pattern, config] of Object.entries(RATE_LIMIT_CONFIGS)) {
    const regex = new RegExp(`^${pattern.replace(/\[.*?\]/g, '[^/]+')}$`);
    if (regex.test(endpoint)) {
      return config;
    }
  }

  return null;
}

/**
 * Generate rate limit key from request
 */
export function generateRateLimitKey(
  endpoint: string,
  identifier: string,
  isAuthenticated: boolean,
): string {
  const prefix = isAuthenticated ? 'auth' : 'anon';
  return `ratelimit:${prefix}:${endpoint}:${identifier}`;
}

/**
 * Check if request should be rate limited
 */
export async function checkRateLimit(
  store: RateLimitStore,
  endpoint: string,
  identifier: string,
  isAuthenticated: boolean,
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const config = getRateLimitConfig(endpoint);
  if (!config) {
    return { allowed: true, remaining: -1, resetTime: 0 };
  }

  const key = generateRateLimitKey(endpoint, identifier, isAuthenticated);
  const current = await store.increment(key, config.windowMs);

  const allowed = current <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - current);
  const resetTime = Date.now() + config.windowMs;

  return { allowed, remaining, resetTime };
}
