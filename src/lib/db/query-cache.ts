/**
 * Query result caching layer for database optimization
 * Implements TTL-based caching to reduce database load
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate a cache key from query and parameters
   */
  private generateKey(query: string, params?: unknown[]): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${query}:${paramStr}`;
  }

  /**
   * Get cached result if available and not expired
   */
  get<T>(query: string, params?: unknown[]): T | null {
    const key = this.generateKey(query, params);
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry with optional TTL
   */
  set<T>(query: string, data: T, params?: unknown[], ttl?: number): void {
    const key = this.generateKey(query, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidate(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
      })),
    };
  }
}

export const queryCache = new QueryCache();
