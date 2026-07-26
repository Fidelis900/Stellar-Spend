# Database Query Optimization Guide

## Overview

This document outlines the database optimization strategies implemented in Stellar-Spend to improve query performance and reduce database load.

## Optimization Strategies

### 1. Connection Pooling

The application uses PostgreSQL connection pooling via the `pg` library:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**Benefits:**
- Reuses database connections instead of creating new ones
- Reduces connection overhead
- Improves response times

### 2. Query Caching

Implemented in `src/lib/db/query-cache.ts`, the query cache layer provides:

- **TTL-based caching**: Automatically expires cached results after a configurable time
- **Pattern-based invalidation**: Invalidate related cache entries when data changes
- **Cache statistics**: Monitor cache performance

**Usage:**

```typescript
import { queryCache } from "@/lib/db/query-cache";

// Get cached result or null
const cached = queryCache.get("SELECT * FROM users WHERE id = $1", [userId]);

// Set cache entry with 5-minute TTL
queryCache.set("SELECT * FROM users WHERE id = $1", userData, [userId], 5 * 60 * 1000);

// Invalidate related cache entries
queryCache.invalidate("SELECT.*FROM users");
```

### 3. Database Indexes

Added indexes on frequently queried columns to speed up lookups:

- **Single-column indexes**: For columns used in WHERE clauses
- **Composite indexes**: For common multi-column query patterns
- **Covering indexes**: To support index-only scans

**Key indexes:**
- `idx_transactions_user_address`: Fast user transaction lookups
- `idx_transactions_status`: Fast status-based queries
- `idx_transactions_user_status`: Composite index for user + status queries
- `idx_api_keys_key_hash`: Fast API key validation

**To apply indexes:**

```bash
psql $DATABASE_URL < migrations/011_add_query_indexes.sql
```

### 4. Query Monitoring

All database queries are automatically monitored via `recordDbQuery()`:

```typescript
export const pool: Pick<Pool, "query"> = {
  query: async (...args: Parameters<Pool["query"]>) => {
    const start = Date.now();
    try {
      return await (_pool.query as (...a: unknown[]) => Promise<unknown>)(...args);
    } finally {
      recordDbQuery({
        query: sql,
        durationMs: Date.now() - start,
        timestamp: start,
      });
    }
  },
};
```

**Benefits:**
- Identifies slow queries
- Tracks query performance over time
- Helps identify optimization opportunities

### 5. Best Practices

#### Use Parameterized Queries

Always use parameterized queries to prevent SQL injection and enable query plan caching:

```typescript
// Good
const result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

// Bad
const result = await pool.query(`SELECT * FROM users WHERE id = ${userId}`);
```

#### Limit Result Sets

Use LIMIT and OFFSET to avoid fetching unnecessary data:

```typescript
const result = await pool.query(
  "SELECT * FROM transactions WHERE user_id = $1 LIMIT $2 OFFSET $3",
  [userId, pageSize, offset]
);
```

#### Use Appropriate Indexes

When adding new queries, consider adding indexes on:
- Columns used in WHERE clauses
- Columns used in JOIN conditions
- Columns used in ORDER BY clauses

#### Cache Frequently Accessed Data

Use the query cache for data that doesn't change frequently:

```typescript
const getCurrencies = async () => {
  const cached = queryCache.get("SELECT * FROM currencies");
  if (cached) return cached;

  const result = await pool.query("SELECT * FROM currencies");
  queryCache.set("SELECT * FROM currencies", result.rows, [], 60 * 60 * 1000); // 1 hour
  return result.rows;
};
```

#### Monitor Query Performance

Regularly check query performance metrics:

```typescript
import { getPerformanceMetrics } from "@/lib/performance";

const metrics = getPerformanceMetrics();
console.log("Slow queries:", metrics.slowQueries);
```

## Performance Targets

- **Average query time**: < 50ms
- **P95 query time**: < 200ms
- **P99 query time**: < 500ms
- **Cache hit rate**: > 70% for read-heavy operations

## Troubleshooting

### Slow Queries

1. Check query execution plan: `EXPLAIN ANALYZE SELECT ...`
2. Verify indexes exist: `\d+ table_name`
3. Check query cache hit rate
4. Consider adding new indexes

### Connection Pool Exhaustion

1. Check active connections: `SELECT count(*) FROM pg_stat_activity;`
2. Increase pool size if needed
3. Reduce query execution time
4. Implement connection pooling at application level

### High Memory Usage

1. Check cache size: `queryCache.getStats()`
2. Reduce cache TTL
3. Implement cache eviction policy
4. Monitor long-running queries

## References

- [PostgreSQL Query Performance](https://www.postgresql.org/docs/current/performance.html)
- [pg Library Documentation](https://node-postgres.com/)
- [Database Indexing Best Practices](https://use-the-index-luke.com/)

## #701 Optimizations (2026-06-29)

### New Indexes — `024_db_optimization_701.sql`

| Index | Table | Columns | Type | Rationale |
|---|---|---|---|---|
| `idx_transactions_lower_user_address` | `transactions` | `LOWER(user_address)` | Expression | Supports case-insensitive `LOWER(user_address) = LOWER($1)` lookups without seq-scan |
| `idx_transactions_user_address_created_at` | `transactions` | `(user_address, created_at DESC)` | Composite | Covers `getByUser` sorted history queries |
| `idx_transactions_payout_order_id` | `transactions` | `payout_order_id` | Single | Speeds up `getByPayoutOrderId` webhook lookups |
| `idx_transaction_batches_user_status_created` | `transaction_batches` | `(user_id, status, created_at DESC)` | Composite | Batch list queries filtered by user + status |
| `idx_batch_transactions_batch_status` | `batch_transactions` | `(batch_id, status)` | Composite | Batch member lookups filtered by status |
| `idx_transaction_batches_active` | `transaction_batches` | `(user_id, created_at DESC) WHERE status IN ('pending','processing')` | Partial | Reduces index size; covers active-batch-only queries |
| `idx_merchant_accounts_user_id` | `merchant_accounts` | `user_id` | Single | Added conditionally (table may not exist in all deployments) |

### N+1 Elimination — `DatabaseTransactionRepository`

Added `getByIds(ids: string[])` batch method that fetches multiple transactions in a single `WHERE id IN (...)` query. Callers that previously looped over IDs calling `getById()` can now use one round-trip.

`getByUser` updated to use `LOWER(user_address)` comparison, aligning with the new expression index for case-insensitive lookups.

### Query Timing Metrics — `dal.ts` and `database-transaction.ts`

All `pool.query` calls are now routed through a `timedQuery()` wrapper that records wall-clock duration and row count via `queryOptimizer.recordQuery()`. This feeds the existing `QueryOptimizer` slow-query detection and the `/api/health` metrics endpoint.

```typescript
async function timedQuery(sql: string, values: unknown[]) {
  const start = Date.now();
  const result = await pool.query(sql, values);
  queryOptimizer.recordQuery(sql, Date.now() - start, result.rowCount ?? 0);
  return result;
}
```
