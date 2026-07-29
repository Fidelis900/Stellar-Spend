# ADR-009: Provider Abstraction and Routing

**Status:** Accepted  
**Date:** 2026-06-27  
**Deciders:** Stellar-Spend core team

---

## Context

Stellar-Spend currently routes all payouts through a single provider pair:

- **Bridge:** Allbridge (Stellar → Base USDC)
- **Payout:** Paycrest (Base USDC → fiat)

As the platform scales to more corridors and higher volume, single-provider dependency creates risks:

- **Availability:** If Allbridge or Paycrest is down, all transfers fail.
- **Cost:** A single provider cannot be optimized for per-corridor fee structures.
- **Expansion:** Adding a new corridor may require a different settlement provider.

We need an abstraction that allows:

1. Multiple bridge providers and payout providers to coexist
2. Intelligent routing (best rate, lowest fee, availability)
3. Per-corridor provider configuration
4. Graceful degradation when a provider is unhealthy

Options considered:

**Option A: Hard-coded fallback chain**  
If Allbridge fails, try ProviderB. Simple but not extensible and doesn't cover multi-corridor routing.

**Option B: Registry + health-aware router**  
A `BridgeProviderRegistry` and `PayoutProviderRegistry` hold registered providers. A routing function selects the best provider per corridor based on health status, fee quotes, and configured priority.

**Option C: External routing service**  
Delegate to a third-party aggregator. Creates additional external dependency and latency.

---

## Decision

Adopt **Option B**: dual registries with health-aware routing.

### Registry structure

```
src/lib/offramp/adapters/provider-registry.ts
  └── BridgeProviderRegistry
        ├── registerBridge(name, adapter)
        ├── getEligibleBridges(corridor): BridgeAdapter[]
        ├── checkBridgeHealth(name): HealthStatus
        └── getRoutesForCorridor(corridor): ProviderRoute[]

      PayoutProviderRegistry
        ├── registerPayout(name, adapter)
        ├── getEligiblePayouts(corridor): PayoutAdapter[]
        └── checkPayoutHealth(name): HealthStatus
```

### Routing algorithm

For each transfer:

1. Fetch eligible providers for the requested corridor from `corridor-config.ts`
2. Filter to providers that are currently healthy (health cache TTL: 30 seconds)
3. If multiple providers are eligible, select by: lowest effective fee → lowest latency (from recent history)
4. If the selected provider fails mid-transaction, record the failure and surface an error — **no automatic mid-transaction retry** to avoid double-charging

### Quote aggregation

The `/api/offramp/quote-aggregate` endpoint (backed by `src/lib/quote-aggregator.ts`) fetches quotes from all eligible providers in parallel and returns a ranked list. The UI may optionally show a `QuoteComparison` component allowing users to choose.

### Interfaces

```ts
interface BridgeAdapter {
  name: string;
  buildTransaction(params: BridgeBuildParams): Promise<BridgeTx>;
  getQuote(params: BridgeQuoteParams): Promise<BridgeQuote>;
  getTransactionStatus(hash: string): Promise<BridgeStatus>;
  getHealth(): Promise<HealthStatus>;
}

interface PayoutAdapter {
  name: string;
  createOrder(params: PayoutOrderParams): Promise<PayoutOrder>;
  getOrderStatus(orderId: string): Promise<PayoutStatus>;
  getRate(currency: string): Promise<FxRate>;
  getHealth(): Promise<HealthStatus>;
}
```

---

## Consequences

**Positive:**

- Adding a new bridge or payout provider is a single file addition with no route changes.
- Per-corridor provider assignment is centrally managed in `corridor-config.ts`.
- Health-aware routing prevents routing to degraded providers.
- Quote aggregation gives users the best available rate.

**Negative / Trade-offs:**

- The registry must be initialized at server startup — providers registered after a request has begun are not visible to that request.
- Parallel quote fetching increases latency when providers are slow; timeouts must be tight (≤ 3 seconds per provider).
- Health cache introduces up to 30 seconds of stale health data; a provider that goes down mid-window may still receive routes.
- No mid-transaction automatic provider switch — a failed bridge transaction requires user retry.

**Conventions:**

- All bridge adapters live in `src/lib/offramp/adapters/`
- Payout adapters follow the same directory pattern
- Provider health is checked on a 30-second cached basis; cache is invalidated on error
- `corridor-config.ts` is the single source of truth for which providers serve which corridors

---

_Related: [[ADR-003-adapter-pattern-external-services]], [[ADR-007-onramp-architecture]]_
