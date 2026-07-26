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

## Database Query Budgets

Latency budgets for the highest-traffic database queries, added for #787. See
[`docs/database-optimization.md`](./database-optimization.md) for the general
optimization strategies (connection pooling, query caching) these budgets sit
on top of.

> **Methodology note:** this pass was done by statically auditing the routes
> and middleware that run on most requests and checking their query shape
> against the indexes actually defined in `migrations/`, since no live
> database or production traffic sample was available to run `EXPLAIN
> ANALYZE` against directly. Treat the "Index coverage" column below as
> reasoned-about, not measured. Before relying on it, confirm against a real
> query plan with `queryOptimizer.analyzeQueries()` (`src/lib/db/query-optimizer.ts`,
> already recording live timings for every `dal.ts` call) or `EXPLAIN ANALYZE`
> on staging.

### Top queries by request-path traffic

| # | Query (table / predicate) | Called from | Budget (P95) | Index coverage |
|---|---|---|---|---|
| 1 | `sessions` by `token` | `session-management.ts` `validateSession` — runs on every authenticated request | < 10ms | `idx_sessions_token` (013) |
| 2 | `api_keys` by `key_hash` | `api-keys/service.ts` — runs on every API-key-authenticated request | < 10ms | `idx_api_keys_key_hash` (011) |
| 3 | `idempotency_keys` by `(idempotency_key, method, path)` | `withIdempotency()` middleware — now enforced on all financial mutation routes (#790) | < 15ms | composite primary key (003) |
| 4 | `ip_whitelist` by `user_address` | `ip-whitelist.ts` `isIPWhitelisted` — runs on mutation endpoints with IP enforcement | < 10ms | `idx_ip_whitelist_user_address` (012) |
| 5 | `transactions` by `LOWER(user_address)`, ordered by `timestamp DESC` | `dal.ts` `getByUser` — transaction history / `v1/sync/history` | < 50ms | **was missing** — `011`/`018`/`024` intended to cover this but reference a `created_at` column that doesn't exist on `transactions`; fixed in `027_fix_query_optimization_indexes.sql` |
| 6 | `transactions` by `id` | `dal.ts` `getById` — used after nearly every mutation to return the updated row | < 10ms | primary key (001) |
| 7 | `transactions` by `payout_order_id` | `dal.ts` `getByPayoutOrderId` — Paycrest webhook order lookup | < 10ms | `idx_transactions_payout_order_id` (024) |
| 8 | `audit_logs` insert + by `(user_address, action_type, created_at)` | `audit-logging.ts` — one insert per audited action, read on the admin audit dashboard | insert < 15ms, read < 100ms | `idx_audit_logs_user_address_action_type` (018) |
| 9 | `webhook_nonces` by `nonce_key` | `webhookVerify.ts` `isReplay`/`markNonceUsed` — every inbound webhook with replay protection | < 10ms | primary key (created by `createNonceTable()`) |
| 10 | `transaction_notification_preferences` by `LOWER(user_address)` | `notifications/preferences-store.ts` | < 10ms | **was missing** — PK is on raw `user_address`, unusable under `LOWER()`; fixed in `027_fix_query_optimization_indexes.sql` |

### Known issues fixed alongside this pass

- **`src/lib/db/dal.ts`'s `timedQuery` called itself instead of `pool.query`**,
  an infinite-recursion bug in the function every transaction read/write in
  #5–#7 above goes through. Fixed to call `pool.query` directly.
- **`transactions(created_at DESC)` indexes never existed.** `011_add_query_indexes.sql`,
  `018_optimize_database_queries.sql`, and `024_db_optimization_701.sql` all
  reference a `created_at` column that was never added to `transactions`
  (the column is `timestamp`), so those `CREATE INDEX` statements fail every
  time they run. Rather than editing already-shipped migrations,
  `027_fix_query_optimization_indexes.sql` adds the equivalent index against
  the correct column.

### Enforcing the budget

There is no automated CI check for query latency yet (unlike the bundle-size
budgets above). `queryOptimizer` already flags anything over 1000ms as a slow
query and logs it (`SLOW_QUERY_THRESHOLD` in `src/lib/db/query-optimizer.ts`);
wiring `queryOptimizer.getStatistics()` into a monitoring endpoint or CI gate
is the natural next step if these budgets need enforcement rather than
documentation.

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
