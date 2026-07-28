# ADR-003: Adapter Pattern for External Services

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Stellar-Spend core team

---

## Context

Stellar-Spend integrates with three external services, each with distinct APIs, error models, and failure modes:

| Service         | Purpose                                    | SDK / Transport                               |
| --------------- | ------------------------------------------ | --------------------------------------------- |
| **Paycrest**    | Fiat payout orders, FX rates, bank lookups | REST (fetch)                                  |
| **Allbridge**   | USDC cross-chain bridge (Stellar → Base)   | TypeScript SDK (`@allbridge/bridge-core-sdk`) |
| **Base (viem)** | EVM transaction signing and submission     | `viem` library                                |

The API route handlers (e.g., `POST /api/offramp/paycrest/order`) needed to call these services without:

- Coupling route logic to SDK/library internals.
- Duplicating error handling and retry logic across routes.
- Making unit tests dependent on real network calls.

Options considered:

1. **Direct calls in route handlers** — simplest, but couples routes tightly to third-party APIs; changes to the Paycrest API require touching every route.
2. **Shared utility functions** — better than inline calls, but no clean interface boundary; still hard to swap or mock.
3. **Adapter classes** — each external service has a typed class with a defined interface; route handlers depend on the interface, not the implementation.

---

## Decision

Each external service is encapsulated in an **adapter class** located in `src/lib/clients/`:

```
src/lib/clients/
  allbridge.ts     → AllbridgeAdapter (wraps @allbridge/bridge-core-sdk)
  paycrest.ts      → PaycrestAdapter  (wraps Paycrest REST API)
  base.ts          → BaseClient       (wraps viem for EVM signing)
  index.ts         → re-exports
```

Each adapter is responsible for:

- Translating domain inputs to third-party API parameters.
- Normalizing third-party responses into internal types.
- Wrapping third-party errors into typed internal error classes (e.g., `PaycrestHttpError`).
- Enforcing timeouts and surfacing structured error information.

Route handlers instantiate adapters through the dependency injection container (`src/lib/di/`) or receive them as constructor arguments, making them fully testable with mock adapters.

```ts
// Example: route handler depends on adapter interface, not implementation
export async function POST(req: NextRequest) {
  const adapter = new PaycrestAdapter();
  const order = await adapter.createOrder(body);
  return NextResponse.json({ data: order });
}
```

---

## Consequences

**Positive:**

- Route handlers are free of SDK import concerns and third-party error shapes.
- Swapping a provider (e.g., replacing Paycrest with a different settlement layer) requires only adapter changes, not route changes.
- Unit tests mock the adapter interface entirely — no real HTTP calls, no SDK initialization overhead.
- Centralized error normalization: `PaycrestHttpError` is defined once and handled consistently across all routes that use `PaycrestAdapter`.

**Negative / Trade-offs:**

- Adapter classes add an extra abstraction layer; simple calls require following the adapter → route chain.
- Interface definitions must be kept in sync with the underlying SDK/API when breaking changes occur.
- The adapter pattern works best when the interface is stable; early-stage integrations (where the adapter interface is still changing) benefit less.

**Conventions:**

- All external HTTP calls are made inside adapters.
- Adapters throw typed error classes (`PaycrestHttpError`, etc.) rather than plain `Error`.
- Route handlers catch adapter errors and map them to HTTP status codes.
- Adapter methods are the unit of mocking in tests: `vi.mock('@/lib/clients/paycrest')`.

---

_Related: [[ADR-002-allbridge-sdk-dynamic-import]], [[ADR-004-api-versioning-strategy]]_
