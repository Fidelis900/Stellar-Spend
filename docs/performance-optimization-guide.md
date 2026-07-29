# Performance Optimization Guide

This document covers the performance optimizations implemented across the Stellar-Spend application.

## Table of Contents

1. [Database Connection Pooling](#database-connection-pooling)
2. [API Response Caching](#api-response-caching)
3. [Image Optimization](#image-optimization)
4. [Client-Side Rendering Optimization](#client-side-rendering-optimization)

---

## Database Connection Pooling

### Overview

Database connection pooling improves performance by reusing connections instead of creating new ones for each query.

### Configuration

Configure pool settings via environment variables:

```bash
DB_POOL_SIZE=20              # Maximum connections (default: 20)
DB_POOL_MIN=2                # Minimum connections (default: 2)
DB_IDLE_TIMEOUT=30000        # Idle timeout in ms (default: 30s)
DB_CONNECTION_TIMEOUT=5000   # Connection timeout in ms (default: 5s)
DB_STATEMENT_TIMEOUT=30000   # Statement timeout in ms (default: 30s)
```

### Usage

```typescript
import { pool, getPoolMetrics, closePool } from '@/lib/db/client';

// Query using the pool
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// Get pool metrics
const metrics = getPoolMetrics();
console.log(metrics);
// {
//   totalQueries: 1234,
//   activeConnections: 5,
//   waitingRequests: 0,
//   errors: 0,
//   poolSize: 20,
//   idleCount: 15,
//   waitingCount: 0
// }

// Graceful shutdown
await closePool();
```

### Monitoring

Pool metrics are automatically tracked:

- **totalQueries**: Total queries executed
- **activeConnections**: Currently active connections
- **waitingRequests**: Requests waiting for a connection
- **errors**: Connection errors
- **poolSize**: Total pool size
- **idleCount**: Idle connections
- **waitingCount**: Waiting requests

---

## API Response Caching

### Overview

API response caching reduces database load and improves response times using Redis with stale-while-revalidate pattern.

### Cache Middleware

Use the cache middleware in API routes:

```typescript
import { withCaching, setCacheHeaders } from '@/lib/cache';
import { CacheKey, TTL } from '@/lib/cache';

export async function GET(req: NextRequest) {
  return withCaching(
    {
      key: CacheKey.currencies(),
      ttl: TTL.CURRENCIES,
      staleWhileRevalidate: 3600,
    },
    async () => {
      // Your API logic here
      const data = await fetchCurrencies();
      return new NextResponse(JSON.stringify(data));
    },
  );
}
```

### Cache Control Headers

Responses include cache-control headers:

```
Cache-Control: public, max-age=3600, stale-while-revalidate=3600
X-Cache: HIT|MISS
```

### Stale-While-Revalidate Pattern

The cache service implements SWR for better UX:

1. **Fresh Cache (age < ttl)**: Return cached data immediately
2. **Stale Cache (ttl < age < ttl + swr)**: Return stale data while revalidating in background
3. **Expired Cache (age > ttl + swr)**: Fetch fresh data

```typescript
import { getCachedRate } from '@/lib/cache';

const rate = await getCachedRate('NGN', async () => {
  return fetchRate('NGN');
});
// Returns fresh data if available, stale data while revalidating, or fetches new data
```

### Cache Invalidation

Invalidate cache when data changes:

```typescript
import { invalidateRate, invalidateQuotes, invalidateCurrencies } from '@/lib/cache';

// Invalidate specific cache
await invalidateRate('NGN');

// Invalidate all quotes
await invalidateQuotes();

// Invalidate all currencies
await invalidateCurrencies();
```

### Cache Metrics

Monitor cache performance:

```typescript
import { getCacheMetrics } from '@/lib/cache';

const metrics = getCacheMetrics();
console.log(metrics);
// { hits: 1234, misses: 56, staleHits: 12 }
```

---

## Image Optimization

### Overview

Image optimization reduces bundle size and improves page load times through responsive sizing, lazy loading, and WebP format support.

### OptimizedImage Component

Use the OptimizedImage component instead of `<img>`:

```typescript
import OptimizedImage from "@/components/OptimizedImage";

export function MyComponent() {
  return (
    <OptimizedImage
      src="/images/logo.png"
      alt="Stellar Spend Logo"
      width={200}
      height={200}
      variant="hero"
    />
  );
}
```

### Image Variants

Pre-configured variants for common use cases:

```typescript
// Thumbnail: 100-150px, quality 75
<OptimizedImage src="..." alt="..." variant="thumbnail" />

// Card: responsive up to 400px, quality 80
<OptimizedImage src="..." alt="..." variant="card" />

// Hero: responsive up to 1200px, quality 85, priority loading
<OptimizedImage src="..." alt="..." variant="hero" />

// Icon: 64px, quality 90
<OptimizedImage src="..." alt="..." variant="icon" />
```

### Image Optimization Utilities

```typescript
import {
  getResponsiveSizes,
  imageLoader,
  preloadImage,
  lazyLoadImage,
  getImageDimensions,
} from '@/lib/image-optimization';

// Get responsive sizes for different breakpoints
const sizes = getResponsiveSizes(1200);
// "(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"

// Preload critical images
preloadImage('/images/hero.jpg');

// Get image dimensions for aspect ratio
const dims = getImageDimensions('video'); // { width: 16, height: 9 }
```

### CDN Integration

Configure CDN URL for image optimization:

```bash
NEXT_PUBLIC_CDN_URL=https://cdn.example.com
```

Images will be automatically optimized through the CDN with WebP format and dynamic resizing.

---

## Client-Side Rendering Optimization

### Overview

Client-side rendering optimizations reduce re-renders, improve component performance, and reduce bundle size through code splitting.

### Performance Hooks

#### useMemo - Memoize Expensive Calculations

```typescript
import { useMemoized } from "@/lib/performance-hooks";

function MyComponent({ data }) {
  const expensiveValue = useMemoized(
    () => computeExpensiveValue(data),
    [data],
  );

  return <div>{expensiveValue}</div>;
}
```

#### useCallback - Stable Callbacks

```typescript
import { useStableCallback } from "@/lib/performance-hooks";

function MyComponent() {
  const handleClick = useStableCallback(
    () => console.log("clicked"),
    [],
  );

  return <button onClick={handleClick}>Click me</button>;
}
```

#### useDebounce - Debounce Callbacks

```typescript
import { useDebounce } from "@/lib/performance-hooks";

function SearchComponent() {
  const handleSearch = useDebounce(
    (query: string) => fetchResults(query),
    300,
  );

  return <input onChange={(e) => handleSearch(e.target.value)} />;
}
```

#### useThrottle - Throttle Callbacks

```typescript
import { useThrottle } from "@/lib/performance-hooks";

function ScrollComponent() {
  const handleScroll = useThrottle(
    () => console.log("scrolled"),
    100,
  );

  return <div onScroll={handleScroll}>Scrollable content</div>;
}
```

### React.memo - Memoize Components

```typescript
import { withMemo } from "@/lib/performance-hooks";

const MyComponent = withMemo(function MyComponent({ data }) {
  return <div>{data}</div>;
});

// Or use memo directly
import { memo } from "react";

const MyComponent = memo(function MyComponent({ data }) {
  return <div>{data}</div>;
});
```

### Virtual Scrolling - Large Lists

```typescript
import VirtualList from "@/components/VirtualList";

function MyList({ items }) {
  return (
    <VirtualList
      items={items}
      itemHeight={50}
      containerHeight={500}
      renderItem={(item, index) => <div key={index}>{item.name}</div>}
    />
  );
}
```

### Code Splitting - Reduce Bundle Size

```typescript
import { dynamicComponent, preloadModule } from "@/lib/code-splitting";

// Lazy load a component
const HeavyComponent = dynamicComponent(
  () => import("@/components/HeavyComponent"),
  { loading: () => <div>Loading...</div> },
);

// Preload a module in the background
preloadModule(() => import("@/components/HeavyComponent"));

// Use in component
function MyPage() {
  return <HeavyComponent />;
}
```

### Performance Monitoring

```typescript
import {
  recordMetric,
  measureAsync,
  observeWebVitals,
  getBundleSize,
  reportMetrics,
} from '@/lib/performance-monitoring';

// Record a metric
recordMetric('custom-operation', 123, 'ms');

// Measure async operation
const result = await measureAsync('api-call', async () => {
  return fetch('/api/data').then((r) => r.json());
});

// Observe Core Web Vitals
observeWebVitals((metric) => {
  console.log(`${metric.name}: ${metric.value}ms (${metric.rating})`);
});

// Get bundle size
const bundleSize = getBundleSize();
console.log(bundleSize);
// { total: 1234567, main: 567890, chunks: { ... } }

// Report metrics to analytics
reportMetrics('/api/metrics', getMetrics());
```

---

## Best Practices

### Database

- Use connection pooling for all database operations
- Monitor pool metrics to detect connection exhaustion
- Set appropriate timeouts based on your workload
- Use prepared statements to prevent SQL injection

### Caching

- Use appropriate TTL values for different data types
- Implement cache invalidation when data changes
- Monitor cache hit rates to optimize TTL values
- Use stale-while-revalidate for better UX

### Images

- Always use OptimizedImage component for images
- Set appropriate variant for each use case
- Preload critical images for better LCP
- Use responsive sizes for different breakpoints

### Components

- Use React.memo for expensive components
- Use useCallback for event handlers
- Use useMemo for expensive calculations
- Implement virtual scrolling for large lists
- Use code splitting for heavy components
- Monitor performance metrics regularly

---

## Monitoring and Debugging

### Enable Debug Logging

```bash
DEBUG=stellar-spend:* npm run dev
```

### Check Performance Metrics

```typescript
import { getMetrics, getCacheMetrics } from '@/lib/cache';
import { getPoolMetrics } from '@/lib/db/client';

console.log('Cache metrics:', getCacheMetrics());
console.log('Pool metrics:', getPoolMetrics());
console.log('Performance metrics:', getMetrics());
```

### Use Chrome DevTools

1. **Performance Tab**: Record and analyze performance
2. **Network Tab**: Check image sizes and cache headers
3. **Coverage Tab**: Identify unused code for splitting
4. **Lighthouse**: Run audits for performance recommendations

---

## References

- [Next.js Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
- [React Performance](https://react.dev/reference/react/useMemo)
- [Web Vitals](https://web.dev/vitals/)
- [PostgreSQL Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
