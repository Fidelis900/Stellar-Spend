# ADR-006: Idempotency Implementation

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Stellar-Spend core team

---

## Context

Several Stellar-Spend API endpoints involve non-idempotent side effects:

- `POST /api/offramp/paycrest/order` — creates a real fiat payout order with Paycrest and triggers an on-chain USDC transfer.
- `POST /api/offramp/execute-payout` — sends USDC on Base chain.
- `POST /api/transactions` and `PATCH /api/transactions/[id]` — write to the database.

Network failures and client retries can cause these operations to execute more than once, resulting in duplicate orders, duplicate on-chain transfers, or duplicate database rows. This is a critical correctness problem: a duplicate Paycrest order means the user's bank receives the payout twice.

Options considered:

1. **Client-side deduplication only** — require clients to check status before retrying. Unreliable; clients crash.
2. **Unique constraints on `reference` field** — partial protection for Paycrest orders, but doesn't cover arbitrary retries or in-flight duplicates.
3. **Server-side idempotency keys** — clients send a unique `Idempotency-Key` header; the server stores the response for a TTL window and replays it for retries with the same key.

---

## Decision

A **server-side idempotency key system** is implemented, backed by the PostgreSQL database (`migrations/003_create_idempotency_keys.sql`).

**How it works:**

1. The client includes a unique `Idempotency-Key` header with mutating requests.
2. The server looks up the key in the `idempotency_keys` table.
   - **Not found:** acquire a lock (insert row with `status = 'in_progress'`) and proceed with the operation.
   - **In-progress:** return `409 Conflict` — another request with the same key is already executing.
   - **Complete:** return the stored response body with `Idempotency-Status: replayed` — no operation is re-executed.
   - **Key reuse with different body:** return `409 Conflict` — mismatched reuse.
3. On success, store the response body in the `idempotency_keys` row and set `status = 'complete'`.
4. Server-side `5xx` errors are **not** cached — clients can safely retry after transient failures.
5. Completed records expire after `IDEMPOTENCY_TTL_MS` (default: 24 hours). In-flight locks expire after `IDEMPOTENCY_LOCK_TTL_MS` (default: 5 minutes).

**Response headers on all idempotent routes:**

```
Idempotency-Key: <the-key>
Idempotency-Status: created | replayed | conflict
```

**Endpoints that support `Idempotency-Key`:**

| Endpoint                           | Side effect protected                        |
| ---------------------------------- | -------------------------------------------- |
| `POST /api/offramp/paycrest/order` | Paycrest order creation + Base USDC transfer |
| `POST /api/offramp/execute-payout` | Base USDC on-chain transaction               |
| `POST /api/transactions`           | Database write                               |
| `PATCH /api/transactions/[id]`     | Database write                               |

---

## Consequences

**Positive:**

- Clients can safely retry any listed endpoint on network failure without risk of double execution.
- In-flight lock prevents concurrent duplicate requests from racing to create the same order.
- The stored response allows the server to replay the _exact_ original response, including IDs and addresses that the client needs for the next step.
- TTL-based cleanup keeps the `idempotency_keys` table from growing unboundedly.

**Negative / Trade-offs:**

- Requires a database round-trip on every call to a protected endpoint, even when no retry is happening.
- In-flight locks (5-minute TTL) mean a crashed server process can leave a lock that blocks retries for up to 5 minutes.
- Clients must generate globally unique idempotency keys — typically a UUID combined with a user or session identifier.
- `5xx` responses are not cached, so a catastrophic failure mid-operation (e.g., Paycrest order created but Base transfer failed) cannot be replayed — the client must check status manually.

**Key generation guidance for clients:**

```
<operation-type>-<user-wallet-address>-<timestamp-or-uuid>
// e.g.: "order-GABC123-9d9f2b9d-1"
```

---

_Related: [[ADR-001-localstorage-transaction-history]], [[ADR-003-adapter-pattern-external-services]]_
