# Performance Budgets & Monitoring

## Bundle Size Budgets

Per-route bundle size budgets enforced in CI to ensure fast load times on mobile networks.

### Current Budgets

| Route | Max Size | Max Initial JS | Rationale |
|-------|----------|----------------|-----------|
| `/` (Homepage) | 350 KB | 200 KB | Landing page must load fast on 3G. Critical for engagement. |
| `/api/*` | 50 KB | 0 KB | Server-only routes. No client JS should be bundled. |

### Budget Enforcement

CI fails automatically when bundle size exceeds budget:

```bash
# Check bundle sizes locally
npm run build
find .next/static/chunks -name "*.js" -exec ls -lh {} \;
```

## Web Vitals Targets

Based on Core Web Vitals "Good" thresholds:

| Metric | Target | Description |
|--------|--------|-------------|
| **LCP** | < 2.5s | Largest Contentful Paint - main content visible |
| **INP** | < 200ms | Interaction to Next Paint - responsiveness |
| **CLS** | < 0.1 | Cumulative Layout Shift - visual stability |
| **FCP** | < 1.8s | First Contentful Paint - first pixel rendered |
| **TTFB** | < 800ms | Time to First Byte - server response time |

### Tracking Web Vitals

Web Vitals are automatically tracked and sent to `/api/monitoring/vitals`:

```tsx
import { useWebVitals } from '@/hooks/useWebVitals';

export default function MyApp() {
  useWebVitals(); // Track vitals automatically
  return <YourApp />;
}
```

## Performance Dashboard

View aggregated metrics:

```bash
# Local development
curl http://localhost:3001/api/monitoring/vitals

# Production
curl https://your-domain.com/api/monitoring/vitals
```

Returns:
```json
{
  "period": "24h",
  "metrics": {
    "lcp": { "p50": 1800, "p75": 2200, "p95": 2800 },
    "inp": { "p50": 100, "p75": 150, "p95": 250 },
    "cls": { "p50": 0.05, "p75": 0.08, "p95": 0.12 }
  }
}
```

## CI Integration

### Bundle Size Check

Runs on every build:
- Analyzes `.next/static/chunks/` for JS bundles
- Compares total size against budget
- Fails CI if budget exceeded

### Lighthouse CI

Runs on PRs:
- Checks LCP, INP, CLS thresholds
- Requires deployed preview URL for full audit
- Basic budget validation runs on every build

## Optimization Strategy

### Reducing Bundle Size

1. **Code Splitting**: Use dynamic imports for large dependencies
2. **Server Components**: Move non-interactive components to RSC (Issue #699)
3. **Tree Shaking**: Ensure imports are ESM-compatible
4. **Lazy Loading**: Defer below-the-fold components

### Improving Web Vitals

1. **LCP**: Optimize images, inline critical CSS, preload fonts
2. **INP**: Reduce JavaScript execution time, use web workers
3. **CLS**: Reserve space for dynamic content, use aspect ratios
4. **TTFB**: Enable edge caching, optimize API routes

## Monitoring Integration

In production, forward metrics to your observability platform:

```typescript
// src/app/api/monitoring/vitals/route.ts
// Forward to Datadog, New Relic, CloudWatch, etc.
await datadogClient.metric(payload.name, payload.value, {
  tags: [`url:${payload.url}`, `rating:${payload.rating}`],
});
```

## Budget Adjustments

To adjust budgets, update `src/lib/bundle-monitoring.ts`:

```typescript
export const BUNDLE_BUDGETS: BundleBudget[] = [
  {
    route: '/',
    maxSize: 350_000, // Adjust as needed
    maxInitialJS: 200_000,
    rationale: 'Document why this budget is set',
  },
];
```

**Always justify budget increases with performance data.**

## References

- [Web Vitals](https://web.dev/vitals/)
- [Next.js Bundle Analysis](https://nextjs.org/docs/app/building-your-application/optimizing/bundle-analyzer)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
