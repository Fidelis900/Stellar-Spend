# Performance Testing Strategy

## Overview

Performance testing ensures the application meets performance requirements and can handle expected load. This document covers load profiles, CI integration, identified bottlenecks, and capacity planning.

## Load Profiles

Three named scenarios live in `scripts/performance/scenarios/`:

| Profile | File | VUs | Duration | Purpose |
|---------|------|-----|----------|---------|
| Normal  | `scenarios/normal.js`  | 0→25 | ~6 min  | Baseline; runs on every PR |
| Peak    | `scenarios/peak.js`    | 0→200 spike | ~7 min | Stress + spike; runs on push to main and nightly |
| Soak    | `scenarios/soak.js`    | 10 steady | 30 min | Memory / pool-leak detection; nightly only |

`scripts/performance/load-test.js` is the legacy combined script kept for local ad-hoc runs.

## Running Locally

```bash
# Normal load (quick feedback)
BASE_URL=http://localhost:3001 k6 run scripts/performance/scenarios/normal.js

# Peak stress
BASE_URL=http://localhost:3001 k6 run scripts/performance/scenarios/peak.js

# Soak (short, 5-minute override)
BASE_URL=http://localhost:3001 SOAK_DURATION=5m k6 run scripts/performance/scenarios/soak.js

# Legacy combined script
BASE_URL=http://localhost:3001 k6 run scripts/performance/load-test.js

# Save baseline for diffing
BASE_URL=http://localhost:3001 k6 run --out json=baseline.json scripts/performance/scenarios/normal.js
```

## CI/CD Integration

Performance tests run automatically via `.github/workflows/performance-tests.yml`:

| Trigger | Normal | Peak | Soak |
|---------|--------|------|------|
| PR → main/develop | ✅ (blocks merge) | — | — |
| Push to main/develop | ✅ | ✅ | — |
| Nightly schedule (02:00 UTC) | ✅ | ✅ | ✅ |
| `workflow_dispatch` | configurable | configurable | configurable |

The **regression-gate** job validates results from the normal-load run and fails the workflow if thresholds are breached.

## Performance Thresholds (Regression Gate)

| Metric | Normal | Peak | Soak |
|--------|--------|------|------|
| P95 latency | < 500 ms | < 800 ms | < 600 ms |
| P99 latency | < 800 ms | < 2000 ms | < 1200 ms |
| Error rate | < 1 % | < 5 % | < 1 % |

### Per-Endpoint Budgets

| Endpoint | P95 Latency | Error Rate |
|----------|-------------|------------|
| `GET /api/health` | 200 ms | 0 % |
| `GET /api/offramp/rate` | 300 ms | 1 % |
| `GET /api/offramp/currencies` | 400 ms | 1 % |
| `POST /api/offramp/quote` | 1000 ms | 5 % |
| `POST /api/offramp/order` | 2000 ms | 5 % |

## Metrics Collected

| Metric | Description |
|--------|-------------|
| `http_req_duration` | End-to-end request latency |
| `http_req_failed` | HTTP 4xx/5xx rate |
| `api_duration` | Tagged by endpoint name |
| `db_pool_saturation` | VU count / pool-size proxy (0-100 %) |
| `active_connections` | Concurrent VU count |
| `soak_pool_saturation` | Pool saturation during soak run |

## Identified Bottlenecks

### 1. Quote Endpoint — External Provider Latency
**Evidence:** `POST /api/offramp/quote` P99 regularly exceeds 800 ms because the route fans out to Allbridge and Paycrest provider APIs before returning.  
**Mitigation:** Cache quotes with a 60-second TTL (`src/lib/cache/service.ts → getCachedQuote`). Cache hit path is < 10 ms.  
**Remaining risk:** Cold-cache quota quota fetches (e.g., after deploy) hit the 1000 ms budget under normal load.

### 2. DB Connection Pool — Limited Pool Size
**Evidence:** At 50+ VUs the `db_pool_saturation` gauge climbs past 80 %. With the default `pg` pool (`max: 10`) each VU that lands a DB query blocks others.  
**Mitigation:** Query result caching (`getCachedCurrencies`, `getCachedRate`) significantly reduces pool pressure. Pool size is configurable via `PGPOOL_MAX` env var.  
**Remaining risk:** Un-cached paths (e.g., webhook writes, order inserts) are serialized through the pool.

### 3. Rate Endpoint — Stale-While-Revalidate Jitter
**Evidence:** Rate calls served from stale cache trigger a background revalidation (`service.ts`). Under peak load many VUs may simultaneously trigger revalidation, producing a brief latency spike.  
**Mitigation:** TTL of 30 s keeps the stale window short. Background revalidation does not block the response.

### 4. Soak — No Memory Leak Detected (Baseline)
Current soak baseline shows flat P99 across the 30-minute window. No progressive latency growth (a common symptom of memory or connection leaks) has been observed.

## Capacity Planning Notes

### Current Capacity (Single Instance, default config)
- **Sustainable throughput:** ~25 concurrent VUs / ~50 req/s before P95 approaches the 500 ms budget.
- **Peak burst:** ~150 VUs for short spikes with P95 staying under 800 ms, provided the cache is warm.
- **DB pool ceiling:** 10 simultaneous DB queries (`PGPOOL_MAX=10`). Exceeding this queues requests.

### Scaling Recommendations

| Scenario | Action |
|----------|--------|
| > 50 sustained VUs | Increase `PGPOOL_MAX` to 20–30 or add a read replica |
| > 150 VUs burst | Horizontal scaling (add a second Next.js instance behind a load balancer) |
| Quote latency budget breached | Increase quote cache TTL to 120 s or pre-warm cache on deploy |
| Rate endpoint overwhelmed | Move rate fetching to a dedicated background job; serve from cache-only in the API |

### Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `PGPOOL_MAX` | 10 | PostgreSQL pool size |
| `REDIS_URL` | unset | If unset, in-memory cache is used (no TTL sharing between instances) |
| `SOAK_DURATION` | `30m` | Override soak test duration when running locally |

## Continuous Monitoring

Production performance is tracked via Sentry performance monitoring and CloudWatch metrics. Set up alerts for:
- P95 API latency > 500 ms (sustained > 5 min)
- Error rate > 2 % (sustained > 2 min)
- DB pool wait time > 100 ms average
