# ADR-007: On-Ramp Architecture — Provider Registry and Order Flow

**Status:** Accepted  
**Date:** 2026-06-27  
**Deciders:** Stellar-Spend core team

---

## Context

Stellar-Spend's initial scope was exclusively an **off-ramp** (USDC → fiat). The new phase adds an **on-ramp** capability: users deposit fiat and receive USDC on their Stellar wallet. This requires:

- A new order flow distinct from the off-ramp flow (fiat in → USDC out)
- Integration with third-party on-ramp providers (e.g., MoonPay)
- Support for multiple providers with different quote APIs, webhook events, and settlement mechanisms
- Reconciliation against the same ledger used by the off-ramp

Key design questions:

1. Should on-ramp and off-ramp share code, or be separate modules?
2. How do we support multiple on-ramp providers without tight coupling?
3. How does on-ramp settlement interact with the Soroban escrow contract?

Options considered:

**Option A: Monolithic handler**  
A single route reads the `provider` query param and branches with `if/else`. Simple to start; brittle as providers grow.

**Option B: Plugin registry**  
Providers implement a common `OnrampProvider` interface and register with a `OnrampProviderRegistry`. Routes are provider-agnostic.

**Option C: Separate service per provider**  
Independent Next.js apps per provider. Maximum isolation but unacceptable operational overhead.

---

## Decision

On-ramp follows **Option B**: a `OnrampProviderRegistry` (at `src/lib/onramp/adapters/provider-registry.ts`) accepts `OnrampAdapter` implementations at startup.

The on-ramp order flow:

```
User → POST /api/onramp/order
         │
         ▼
  OnrampService.createOrder()
         │
         ├─ Selects provider via OnrampProviderRegistry.getProvider()
         │
         ├─ Creates provider order (returns redirect / widget URL)
         │
         ├─ Writes order to DB with status=pending
         │
         └─ Returns { orderId, redirectUrl }

Provider webhook → POST /api/onramp/webhooks/provider
         │
         ▼
  OnrampService.handleWebhook()
         │
         ├─ Verifies webhook signature
         │
         ├─ Bridges Base USDC → Stellar USDC (via Allbridge reverse path)
         │
         └─ Updates order status + notifies user
```

The `OnrampAdapter` interface defines:

- `getQuote(params): Promise<OnrampQuote>`
- `createOrder(params): Promise<OnrampOrder>`
- `getOrderStatus(orderId): Promise<OnrampOrderStatus>`
- `getHealth(): Promise<HealthStatus>`
- `getCapabilities(): ProviderCapabilities`

On-ramp and off-ramp share:

- The ledger (`src/lib/ledger/`) for double-entry accounting
- The reconciliation job
- The notification service
- The `corridor-config.ts` for supported currency corridors

---

## Consequences

**Positive:**

- New on-ramp providers require only a new adapter file — no route changes.
- Health checks and corridor routing are provider-agnostic.
- Shared ledger ensures consistent accounting across ramp directions.
- On-ramp adapters are independently testable with mock implementations.

**Negative / Trade-offs:**

- The `OnrampAdapter` interface must remain stable; adding mandatory methods is a breaking change for all registered providers.
- The Base → Stellar bridge path (reverse Allbridge) is longer than the forward path; timing guarantees differ.
- Fiat-in settlement latency (card processing, bank transfer) is outside our control and harder to track than the off-ramp's USDC-in flow.

**Conventions:**

- Adapters live in `src/lib/onramp/adapters/`
- The `MoonpayAdapter` is the reference implementation
- All webhook endpoints verify provider signatures before processing
- On-ramp orders use the same `transactions` table as off-ramp orders with `direction: 'onramp'`

---

_Related: [[ADR-003-adapter-pattern-external-services]], [[ADR-008-soroban-escrow-trust-model]]_
