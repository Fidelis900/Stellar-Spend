# ADR-002: Allbridge SDK Dynamic Import Strategy

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Stellar-Spend core team

---

## Context

The `@allbridge/bridge-core-sdk` package is a heavy ESM-only module that performs network calls to the Allbridge API and Stellar/Base RPC endpoints at initialization time. Importing it statically at the module level caused two problems in the Next.js App Router context:

1. **Build failures** — Next.js 15 with Turbopack (and the standard webpack pipeline) cannot statically bundle some ESM packages that use dynamic `import()` internally or rely on top-level `await`.
2. **Cold-start overhead** — Loading the SDK on every serverless function cold start, even for routes that do not use the bridge (e.g., `/api/health`, `/api/offramp/currencies`), added unnecessary latency.
3. **Cache invalidation** — The SDK maintains internal state (chain details, token maps) that should be periodically refreshed. A module-level static import makes controlled cache invalidation harder.

Options considered:

1. **Static top-level import** — simple, but fails the build and inflates cold-start time.
2. **Dynamic `import()` per request** — avoids build issues, but re-initializes the SDK on every request.
3. **Module-level singleton with dynamic import on first use + TTL cache** — lazy initialization that is safe for the build, with a reusable singleton and time-bounded chain detail caching.

---

## Decision

The Allbridge SDK is initialized using a **lazy singleton** pattern inside `src/lib/clients/allbridge.ts`:

- On first call, the SDK is imported dynamically (`await import('@allbridge/bridge-core-sdk')`).
- The initialized SDK instance is stored in a module-level variable and reused across subsequent requests.
- Chain details (`chainDetailsMap`) and token lookups are cached with a **5-minute TTL**.
- Any SDK error (network failure, missing chain, missing token) calls `invalidateSdkCache()`, which clears both the singleton and the cache so the next request triggers a fresh initialization.

```ts
// Simplified pattern from allbridge-adapter.ts
let sdkInstance: AllbridgeCoreSdk | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function initializeAllbridgeSdk() {
  if (!sdkInstance) {
    const { AllbridgeCoreSdk } = await import('@allbridge/bridge-core-sdk');
    sdkInstance = new AllbridgeCoreSdk({
      /* RPC URLs from env */
    });
  }
  return sdkInstance;
}

export function invalidateSdkCache() {
  sdkInstance = null;
  cacheTimestamp = 0;
}
```

---

## Consequences

**Positive:**

- Next.js builds successfully — the dynamic import is deferred past the build graph resolution phase.
- Cold starts for non-bridge routes are unaffected.
- Cache invalidation is explicit and testable.
- Singleton pattern keeps network connections warm across concurrent requests.

**Negative / Trade-offs:**

- The very first request to a bridge route after a cold start (or after cache invalidation) incurs the full SDK initialization cost (~200–500 ms depending on RPC latency).
- Module-level state means the singleton persists for the lifetime of the server process; long-running processes accumulate stale state unless something triggers `invalidateSdkCache()`.
- Testing requires mocking the dynamic import path, which is slightly more involved than mocking a static module.

**Mitigations:**

- The 5-minute TTL ensures chain details stay reasonably fresh without constant re-fetching.
- Error-triggered invalidation means transient RPC failures self-heal on retry.
- Tests mock `@allbridge/bridge-core-sdk` at the Vitest module level, keeping the test suite fast and deterministic.

---

_Related: [[ADR-003-adapter-pattern-external-services]]_
