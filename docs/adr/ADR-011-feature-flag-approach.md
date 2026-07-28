# ADR-011: Feature Flag Approach

**Status:** Accepted  
**Date:** 2026-06-27  
**Deciders:** Stellar-Spend core team

---

## Context

As Stellar-Spend adds new corridors, UI features, and backend capabilities, we need a mechanism to:

1. **Gradually roll out** new features to a subset of users before full release
2. **Kill-switch** a problematic feature without deploying new code
3. **A/B test** UI changes (e.g., new quote display, alternative fee selectors)
4. **Gate** features behind KYC tier, wallet type, or environment (staging vs production)

Currently, environment variables (`NEXT_PUBLIC_*`) are used as on/off toggles. This is inflexible — changing a flag requires a redeployment.

Options considered:

**Option A: Environment variable flags (status quo)**  
`NEXT_PUBLIC_ENABLE_KES_CORRIDOR=true`. Simple, but requires redeploy to toggle; no gradual rollout.

**Option B: Database-backed flags with admin API**  
Flags stored in a DB table; toggled via an admin endpoint. Runtime updates without redeploy. Requires DB query on every request unless cached.

**Option C: Third-party feature flag service**  
LaunchDarkly, PostHog, etc. Full-featured (gradual rollout, A/B, analytics). Adds external dependency and cost.

**Option D: In-process flag store with DB persistence and caching**  
Flags defined in a schema with defaults; overrides stored in DB; resolved at request time from a short-TTL in-process cache. No external dependency; supports gradual rollout via percentage-based resolution.

---

## Decision

Adopt **Option D**: an in-process flag store with DB persistence, caching, and a typed schema.

### Architecture

```
src/lib/feature-flags/
  schema.ts       — Flag definitions, default values, rollout config
  store.ts        — FeatureFlagStore: resolves flags with cache + overrides
  server.ts       — Server-side helpers: isFlagEnabled(), setFlagOverrides()
  index.ts        — Public API

src/hooks/useFeatureFlag.ts   — Client-side hook (reads server-resolved flags from API)
src/app/api/admin/feature-flags/route.ts — Admin CRUD endpoint
```

### Flag schema example

```ts
// src/lib/feature-flags/schema.ts
export const FLAGS = {
  'corridor.kes': {
    default: false,
    description: 'Enable Kenya KES corridor',
  },
  'ui.quote-comparison': {
    default: false,
    rollout: 0.1, // 10% of requests
    description: 'Show QuoteComparison component to a percentage of users',
  },
  'onramp.moonpay': {
    default: false,
    description: 'Enable MoonPay on-ramp provider',
  },
} satisfies FlagSchema;
```

### Resolution order

1. **Request-level override** (e.g., `?flag=corridor.kes:1` in development only)
2. **DB override** (admin-set value with optional expiry)
3. **Gradual rollout** (seeded by request ID for stable per-user assignment)
4. **Default value** from schema

### Client integration

Server components resolve flags directly via `isFlagEnabled(name)`. Client components use the `useFeatureFlag(name)` hook which reads a `/api/feature-flags` endpoint that returns all enabled flags for the current session. The endpoint response is cached for 60 seconds.

### Admin management

Flags can be toggled via `PUT /api/admin/feature-flags` (requires admin API key). Overrides are persisted to DB and take effect within 60 seconds (cache TTL).

---

## Consequences

**Positive:**

- Flag changes take effect within 60 seconds without deployment
- Gradual rollout is deterministic per-request (stable for a given user across sessions via request ID seeding)
- Typed schema prevents typos — `isFlagEnabled('coridorkes')` is a TypeScript error
- No external dependency; works offline and in test environments
- Admin API allows operational toggling during incidents

**Negative / Trade-offs:**

- Gradual rollout is per-request, not per-user — a user may see different behavior across sessions if they don't have a persistent session ID
- No built-in analytics (who saw flag X, what was the conversion rate). PostHog or Sentry can be added for this separately
- The 60-second cache TTL means kill-switches are not instantaneous. For true emergency kill-switches, an environment variable redeploy is still faster
- DB-backed flags require a migration to add the `feature_flags` table; until then, flags default to schema defaults

**Conventions:**

- Flag names use dot notation: `module.feature` (e.g., `corridor.ghs`, `ui.new-form`)
- Flags are additive — old flags are deprecated, not deleted, to prevent accidental re-activation
- All flag evaluations in server code go through `isFlagEnabled()` from `src/lib/feature-flags/server.ts`
- Never use `process.env` directly for feature gating; use the flag store

---

_Related: [[ADR-005-environment-variable-validation]], [[ADR-009-provider-abstraction-routing]]_
