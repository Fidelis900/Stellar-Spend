import { logger } from '@/lib/logger';
/**
 * Redis client configuration for caching layer.
 * Uses ioredis-compatible interface; falls back to in-memory store when Redis is unavailable.
 */

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  flushPattern(pattern: string): Promise<void>;
  ping(): Promise<boolean>;
}

// ─── In-Memory Fallback ───────────────────────────────────────────────────────

class InMemoryCache implements CacheClient {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...this.store.keys()].filter((k) => regex.test(k));
  }

  async flushPattern(pattern: string): Promise<void> {
    const matched = await this.keys(pattern);
    matched.forEach((k) => this.store.delete(k));
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

// ─── Redis Client (lazy-loaded) ───────────────────────────────────────────────

let _client: CacheClient | null = null;

export function getCacheClient(): CacheClient {
  if (_client) return _client;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('[cache] REDIS_URL not set — using in-memory cache fallback');
    _client = new InMemoryCache();
    return _client;
  }

  // Dynamically require ioredis to avoid bundling issues
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('error', (err: Error) => {
      logger.error('[cache] Redis error:', {}, err.message);
    });

    _client = {
      async get(key) {
        return redis.get(key);
      },
      async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
          await redis.set(key, value, 'EX', ttlSeconds);
        } else {
          await redis.set(key, value);
        }
      },
      async del(key) {
        await redis.del(key);
      },
      async keys(pattern) {
        return redis.keys(pattern);
      },
      async flushPattern(pattern) {
        const matched: string[] = await redis.keys(pattern);
        if (matched.length > 0) {
          await redis.del(...matched);
        }
      },
      async ping() {
        try {
          const result = await redis.ping();
          return result === 'PONG';
        } catch {
          return false;
        }
      },
    };
  } catch {
    logger.warn('[cache] ioredis not available — using in-memory cache fallback');
    _client = new InMemoryCache();
  }

  return _client;
}

/** Reset the client (useful for testing) */
export function resetCacheClient(): void {
  _client = null;
}
