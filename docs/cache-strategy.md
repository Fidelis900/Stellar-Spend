# Cache Strategy & Observability

## Overview

Intelligent caching with observability for hot paths (quotes, currencies, institutions). Implements stale-while-revalidate for responsive UX and graceful degradation when cache is unavailable.

## Architecture

- **In-memory cache**: Development and small deployments
- **Production**: Replace with Redis/Memcached for distributed caching
- **Stale-while-revalidate**: Return stale data instantly, refresh in background
- **Graceful degradation**: App functions correctly when cache is down

## Cache Keys & TTL Strategy

| Key Type | TTL | Stale-While-Revalidate | Warming | Rationale |
|----------|-----|------------------------|---------|-----------|
| **Quotes** | 30s | ✅ Yes | ✅ Yes | Hot path, balance freshness vs UX |
| **Currencies** | 1h | ❌ No | ✅ Yes | Rarely changes, long cache OK |
| **Institutions** | 30m | ❌ No | ✅ Yes | Moderate change rate |
| **Account Verify** | 5m | ❌ No | ❌ No | Temporary, user-specific |
| **Bridge Status** | 10s | ✅ Yes | ❌ No | Actively polled, stale OK briefly |
| **Payout Status** | 10s | ✅ Yes | ❌ No | Actively polled, stale OK briefly |

## Stale-While-Revalidate

Improves perceived performance for hot paths:

1. **Cache hit (fresh)**: Return immediately
2. **Cache hit (stale)**: Return stale value instantly, refresh in background
3. **Cache miss**: Fetch fresh data, cache for next request

Example for quotes:
- TTL: 30s
- Stale threshold: 24s (80% of TTL)
- User gets instant response even with slightly stale data
- Fresh data fetched in background for next request

## Cache Warming

Pre-populate cache on server startup to improve initial hit rate:

```typescript
import { warmAllCaches } from '@/lib/cache/warming';

// On server startup
await warmAllCaches();
```

### Warmed Corridors

Popular corridors warmed automatically:

- NGN: 100, 500 USDC
- USD: 100 USDC
- EUR: 100 USDC
- GBP: 100 USDC

Add more corridors in `src/lib/cache/keys.ts`:

```typescript
export const HOT_CORRIDORS = [
  { currency: 'NGN', amount: '100' },
  { currency: 'KES', amount: '50' },
  // Add more...
];
```

## Observability

### Cache Metrics Endpoint

```bash
# Get cache metrics
curl https://your-domain.com/api/monitoring/cache

# Response
{
  "status": "healthy",
  "metrics": {
    "hits": 1234,
    "misses": 567,
    "sets": 890,
    "errors": 2,
    "hitRate": 68.52
  },
  "timestamp": "2026-06-29T01:25:50.485Z"
}
```

### Manual Cache Operations

```bash
# Warm cache manually (admin)
curl -X POST https://your-domain.com/api/monitoring/cache

# Clear cache (admin)
curl -X DELETE https://your-domain.com/api/monitoring/cache
```

### Monitoring Integration

In production, forward metrics to your observability platform:

```typescript
// src/app/api/monitoring/cache/route.ts
const metrics = cache.getMetrics();

// Forward to Datadog, New Relic, CloudWatch, etc.
await datadogClient.gauge('cache.hit_rate', metrics.hitRate);
await datadogClient.gauge('cache.errors', metrics.errors);
```

## Graceful Degradation

App functions correctly when cache is unavailable:

```typescript
import { getCached } from '@/lib/cache';

// Automatic fallback if cache fails
const data = await getCached(key, config, async () => {
  // This fallback is called if cache unavailable
  return fetchFromAPI();
});
```

## Implementation Guide

### 1. Use Cache in API Routes

```typescript
import { getCached } from '@/lib/cache';
import { CACHE_KEYS, generateCacheKey } from '@/lib/cache/keys';

export async function GET() {
  const key = generateCacheKey(CACHE_KEYS.CURRENCIES);
  
  const currencies = await getCached(key, CACHE_KEYS.CURRENCIES, async () => {
    // Fallback: fetch from external API
    return fetchCurrencies();
  });
  
  return NextResponse.json(currencies);
}
```

### 2. Invalidate Cache After Mutations

```typescript
import { cache } from '@/lib/cache';
import { CACHE_KEYS, generateCacheKey } from '@/lib/cache/keys';

// After updating data
await cache.del(generateCacheKey(CACHE_KEYS.CURRENCIES));
```

### 3. Add Custom Cache Keys

```typescript
// src/lib/cache/keys.ts
export const CACHE_KEYS = {
  MY_NEW_KEY: {
    prefix: 'my_key',
    ttl: 300, // 5 minutes
    staleWhileRevalidate: true,
    warmingEnabled: false,
    description: 'My custom cache key',
  } as CacheKeyConfig,
};
```

## Testing

### Unit Tests

```typescript
import { cache } from '@/lib/cache';
import { CACHE_KEYS } from '@/lib/cache/keys';

// Set and retrieve
await cache.set('test_key', { foo: 'bar' }, CACHE_KEYS.QUOTE);
const result = await cache.get('test_key', CACHE_KEYS.QUOTE);
expect(result.value).toEqual({ foo: 'bar' });

// Check metrics
const metrics = cache.getMetrics();
expect(metrics.hitRate).toBeGreaterThan(0);
```

### Cache Invalidation Tests

Verify cache is invalidated correctly after updates:

```typescript
test('invalidate quote cache after update', async () => {
  const key = generateCacheKey(CACHE_KEYS.QUOTE, '100', 'NGN', 'USDC');
  
  // Cache a quote
  await cache.set(key, mockQuote, CACHE_KEYS.QUOTE);
  
  // Invalidate
  await cache.del(key);
  
  // Verify cache miss
  const result = await cache.get(key, CACHE_KEYS.QUOTE);
  expect(result.value).toBeNull();
});
```

## Performance Impact

### Expected Hit Rates

- **Quotes**: 70-80% (hot corridors warmed)
- **Currencies**: 95%+ (rarely changes)
- **Institutions**: 85-90% (moderate change rate)

### Latency Reduction

- **Cache hit**: ~1ms (in-memory)
- **Cache miss**: ~100-500ms (API call)
- **Stale-while-revalidate**: ~1ms perceived (background refresh)

### Cold Start

On server startup:
1. Cache warming completes in ~500ms
2. Popular corridors immediately available
3. First user requests see cache hits

## Production Deployment

### Redis Migration

Replace in-memory cache with Redis:

```typescript
// src/lib/cache/index.ts
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

class RedisCacheClient {
  async get<T>(key: string, config: CacheKeyConfig) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set<T>(key: string, value: T, config: CacheKeyConfig) {
    await redis.setEx(key, config.ttl, JSON.stringify(value));
  }
}
```

### Monitoring Alerts

Set up alerts for:
- Cache hit rate < 60%
- Cache errors > 5/min
- Cache unavailable for > 1 minute

## References

- [HTTP Caching (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Stale-While-Revalidate RFC](https://datatracker.ietf.org/doc/html/rfc5861)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
