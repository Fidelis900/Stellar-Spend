# API Versioning Policy

`src/app/api/v1/` implies a versioning scheme, but the rules governing it were never written down: what obliges us to cut a v2, how long v1 keeps working afterwards, and what a client sees when a version is going away.

This document is that policy. It is the **normative** reference for version lifecycle decisions.

Related documents, none of which duplicate this one:

| Document | Covers |
|---|---|
| [`openapi.yaml`](../openapi.yaml) | **The source of truth for the API contract itself** — routes, schemas, status codes |
| [ADR-004](./adr/ADR-004-api-versioning-strategy.md) | *Why* we chose hybrid URL-path + header versioning |
| [`src/lib/api-versioning/DEPRECATION_POLICY.md`](../src/lib/api-versioning/DEPRECATION_POLICY.md) | Implementation mechanics — thin-adapter route architecture, how to register a version |
| [`docs/api-migration-v1.md`](./api-migration-v1.md) | Client-facing guide for the unversioned → v1 migration |

**`openapi.yaml` is the source of truth for what the API does.** If this document and `openapi.yaml` disagree about a route's shape, `openapi.yaml` wins and this document is wrong. This document is authoritative only for *policy* — lifecycle, timing, and obligations.

---

## Contents

- [Version lifecycle](#version-lifecycle)
- [What forces a new version](#what-forces-a-new-version)
- [When to cut v2](#when-to-cut-v2)
- [Support window](#support-window)
- [Deprecation response contract](#deprecation-response-contract)
- [Version discovery](#version-discovery)
- [Current state and known gaps](#current-state-and-known-gaps)
- [Checklists](#checklists)

---

## Version lifecycle

A version moves through three stages, tracked by `status` in `VERSION_REGISTRY_DATA` ([`src/lib/api-versioning/registry.ts`](../src/lib/api-versioning/registry.ts)):

```
supported ──────► deprecated ──────► sunset
             announce            sunsetAt
             sunset date         elapses
```

| Stage | Guarantee to clients | Registry shape |
|---|---|---|
| **`supported`** | No breaking changes. Additive changes only. Bugs are fixed here. | `status: "supported"` |
| **`deprecated`** | Still fully functional. No new features. Security and correctness fixes only. Every response carries a machine-readable sunset date. | `status: "deprecated"` + `deprecatedAt`, `sunsetAt`, and ideally `migrationGuideUrl` |
| **`sunset`** | Removed. Requests return `410 Gone`. | `sunsetAt` has passed |

Stages are not skippable. **A version is never removed without first spending its full deprecation window in the `deprecated` stage** — no exceptions for low traffic. Traffic estimates are not a substitute for the notice period, since we cannot distinguish "nobody uses it" from "the one integrator who uses it is on holiday".

The single exception is an active security incident where continuing to serve a version causes harm. That is an incident-response decision, not a versioning decision, and it gets communicated directly to affected API-key holders rather than through header metadata.

`deprecatedAt` and `sunsetAt` are ISO 8601 strings. `validateRegistry()` enforces at module load that a `deprecated` entry has both — a missing date is a startup failure, not a silent default.

---

## What forces a new version

The line between "ship it into v1" and "this needs v2" is whether a correct, existing client can break.

### Breaking — requires a new major version

- Removing an endpoint, or changing its path or HTTP method
- Removing a response field, or renaming one
- Changing a response field's type, or its units (e.g. major units → base units)
- Adding a required request parameter, or making an optional one required
- Narrowing accepted request values, or tightening validation so previously accepted input is rejected
- Changing the success status code for an existing operation
- Changing an existing error code's meaning, or the shape of the error envelope
- Changing authentication or scope requirements for an existing endpoint
- Changing default values or default behaviour when a parameter is omitted
- Changing pagination, ordering, or filtering semantics

### Non-breaking — ship into the current version

- Adding a new endpoint
- Adding an **optional** request parameter with a backward-compatible default
- Adding a new response field (clients must ignore unknown fields)
- Adding a new enum value **to a request** parameter
- Adding a new error code for a genuinely new condition
- Relaxing validation to accept more input
- Fixing a response that contradicted `openapi.yaml` — the documented contract was the promise
- Performance, logging, and infrastructure changes with no contract effect

### Judgement calls

- **Adding an enum value to a *response*** is technically breaking — a client with an exhaustive `switch` will fall through. Treat it as breaking when the field drives client control flow (e.g. order status), and non-breaking for informational fields. Document new values in the changelog either way.
- **Fixing a bug where behaviour contradicts `openapi.yaml`** is non-breaking, because `openapi.yaml` is the contract. But if clients have visibly adapted to the buggy behaviour, announce it in the changelog and give notice, even though no version bump is required.
- **Tightening a rate limit** is not a contract change, but treat it as breaking in spirit: announce it with the same notice period.

When genuinely unsure, assume breaking. The cost of an unnecessary version is maintenance; the cost of a missed one is a partner outage.

---

## When to cut v2

Cutting a version is expensive: it doubles the surface under test, and every deprecation obligation below then applies for at least six months. Do it when — and only when — one of these holds:

1. **A required breaking change** from the list above cannot be delivered additively.
2. **Accumulated additive workarounds** have made v1 incoherent — several `*_v2` fields, or parameters that only apply in combination — and the compatibility shims cost more than a clean version.
3. **A security or compliance requirement** cannot be met within the v1 contract.

Reasons that are **not** sufficient on their own:

- Wanting tidier field names or a nicer response shape
- An internal refactor — versions track the external contract, not the implementation
- A new feature that can be added as a new endpoint
- One integrator's preference

**Prefer additive change.** A new optional parameter or a new endpoint serves most needs without a version bump, and `openapi.yaml` documents the result either way.

### Procedure

1. Write an ADR proposing v2: the breaking changes, why they cannot be additive, and the v1 sunset date.
2. Add the `v2` entry to `VERSION_REGISTRY_DATA` with `status: "supported"`.
3. Create routes under `src/app/api/v2/`, following the thin-adapter pattern in [`DEPRECATION_POLICY.md`](../src/lib/api-versioning/DEPRECATION_POLICY.md).
4. Update `openapi.yaml` to document both versions.
5. Publish a migration guide, modelled on [`docs/api-migration-v1.md`](./api-migration-v1.md).
6. Only once v2 is stable in production, move v1 to `deprecated` with `deprecatedAt` and a `sunsetAt` at least six months later.

Note step 6: **v1 is not deprecated on the day v2 ships.** Deprecation starts when the successor is proven, so the notice period is real migration time rather than a countdown clients spend waiting for v2 to stabilise.

---

## Support window

| Obligation | Minimum |
|---|---|
| Notice before sunset (`deprecatedAt` → `sunsetAt`) | **6 months** |
| Overlap where both old and new versions are fully supported | **6 months** |
| Notice for a breaking change to a `supported` version | Not permitted — that is what a new version is for |

Six months is a floor, not a target. Extend it when the change requires integrator work beyond swapping a base path — anything touching signing, settlement, or webhook payload structure warrants twelve.

**During deprecation, a version keeps working.** Deprecated does not mean degraded: no throttling, no injected latency, no partial failures to encourage migration. The only permitted signals are the response headers below and direct communication with API-key holders.

At `sunsetAt`, requests return `410 Gone` — not `404`. `410` tells a client the endpoint existed and is intentionally gone, which is actionable; `404` is indistinguishable from a typo.

---

## Deprecation response contract

This section documents the headers **as currently implemented** in [`middleware.ts`](../middleware.ts). Where the implementation diverges from the policy above, that is recorded in [Known gaps](#current-state-and-known-gaps).

### Every API response

| Header | Value | Notes |
|---|---|---|
| `X-API-Version` | Numeric, no `v` prefix — e.g. `1` | Set on all `/api/v{n}/*` responses |
| `X-Request-Id` | UUID | Echoed from the request or generated |

### Deprecated versions

A deprecated version's responses carry:

| Header | Format | Example |
|---|---|---|
| `Deprecation` | ISO 8601 date — when deprecation was announced | `2025-01-01` |
| `Sunset` | ISO 8601 date — when the version stops working ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)) | `2026-01-01` |
| `Link` | Successor and migration guide | `</api/v1/offramp/quote>; rel="successor-version", </docs/api-migration-v1>; rel="deprecation"` |

Clients should treat a present `Sunset` header as a hard deadline and alert on it. The `Link` relation `successor-version` gives the replacement path directly, so simple clients can migrate by substitution.

### Status codes for version errors

The implemented behaviour differs by *how* the version was requested:

| Request | Response |
|---|---|
| `/api/v1/*` — known version | Passes through, `X-API-Version: 1` |
| `/api/v9/*` — unknown version in the URL | `404` · `{"error": "API version not supported"}` |
| `/api/*` with `X-API-Version: 1` or `Accept: application/vnd.stellarspend.v1+json` | Internally rewritten to `/api/v1/*` |
| `/api/*` with an unknown version header | `400` · `{"error": "Unsupported API version", "supported": ["v1"]}` |
| `/api/*` with no version indicator | Passes through as legacy, with deprecation headers |
| A sunset version | Should be `410 Gone` — see [Known gaps](#current-state-and-known-gaps) |

The `404` / `400` split is deliberate in effect if not by design: an unknown path segment is a routing failure, while an unparseable header is a request error. The `400` response also lists supported versions, which the `404` does not.

`X-API-Version` takes precedence over `Accept`, and a URL prefix takes precedence over both.

---

## Version discovery

```
GET /api/versions
```

```json
{
  "versions": [
    { "version": "v1", "status": "supported", "prefix": "/api/v1" }
  ]
}
```

Deprecated entries additionally carry `deprecatedAt` and `sunsetAt`. This endpoint is the machine-readable form of the lifecycle table, and is the intended way for client tooling to detect an approaching sunset without parsing headers.

**Adding a version means updating the registry**, which this endpoint reads directly — there is no second list to keep in sync.

---

## Current state and known gaps

As of 2026-07-24, the registry contains exactly one entry: `v1`, `supported`, no deprecation dates. No version has ever been deprecated through the registry.

The gaps below are recorded so that the policy above is not mistaken for a description of running code. They matter most at the moment v1 is first deprecated, which is exactly when they would otherwise be discovered.

### 1. Marking a version deprecated in the registry has no runtime effect

`middleware.ts` is what actually runs on every request, and it calls only `registry.isKnown()` and `registry.getAll()`. `registry.isSupported()`, `isDeprecated()`, and `isSunset()` have **no callers** anywhere in the request path.

`DEPRECATION_POLICY.md` states that `headerInjector.addDeprecationHeaders()` will inject `Deprecation`, `Sunset`, and `Link` automatically once an entry is marked deprecated. That is not the case: `headerInjector` and `negotiator` are exported from `src/lib/api-versioning/index.ts` but have no callers outside their own module. The middleware reimplements negotiation inline and emits deprecation headers from `addLegacyDeprecationHeaders()`, which has **hardcoded dates** and applies only to unversioned legacy paths — never to a versioned one.

**Consequence:** setting `status: "deprecated"` on `v1` today would change the `/api/versions` output and nothing else. No client would receive a `Deprecation` or `Sunset` header. Wiring the middleware to the registry is a prerequisite for deprecating any version.

### 2. There is no sunset enforcement

`registry.isSunset()` exists and is correct, but nothing calls it. No code path returns `410 Gone`. A version whose `sunsetAt` has passed keeps serving traffic normally.

### 3. The legacy sunset date has passed

`middleware.ts` hardcodes `Deprecation: 2025-01-01` and `Sunset: 2026-01-01` for unversioned `/api/*` routes, and `openapi.yaml` documents the same date. That date is now in the past, yet legacy routes still serve `200` — so we are advertising a sunset we did not perform.

Two consistent options: sunset the legacy routes for real (returning `410`), or move the date to a new, credible one. A `Sunset` header in the past is worse than either, because it trains clients to ignore the header.

### 4. Deprecation dates are hardcoded, not derived

Because `addLegacyDeprecationHeaders()` embeds its dates as string literals, changing them requires a code change and a deploy, and they can silently drift from the registry. The dates should come from the registry entry, so that `registry.ts` is the single place a lifecycle decision is recorded.

---

## Checklists

### Before an API change

- [ ] Classified against [What forces a new version](#what-forces-a-new-version). If unsure, treated as breaking.
- [ ] `openapi.yaml` updated in the same PR — it is the contract.
- [ ] Changelog entry added under `info.description` in `openapi.yaml`.
- [ ] If breaking: an ADR exists proposing the new version, and the change is not being shipped into a `supported` version.

### Before deprecating a version

- [ ] The successor version is live and stable in production, not merely deployed.
- [ ] A migration guide is published and linked from `migrationGuideUrl`.
- [ ] `sunsetAt` is at least six months after `deprecatedAt` — longer if migration involves signing, settlement, or webhook payload changes.
- [ ] The registry entry has `status`, `deprecatedAt`, `sunsetAt`, and `migrationGuideUrl`.
- [ ] **The middleware actually emits deprecation headers for versioned routes** — see [gap 1](#1-marking-a-version-deprecated-in-the-registry-has-no-runtime-effect). Verify with a real request before announcing.
- [ ] Active API-key holders notified directly, not only through headers.
- [ ] `openapi.yaml` marks the affected operations `deprecated: true`.

### Before sunsetting a version

- [ ] `sunsetAt` has passed.
- [ ] Traffic to the version has been checked, and remaining callers contacted.
- [ ] Requests return `410 Gone`, not `404` — see [gap 2](#2-there-is-no-sunset-enforcement).
- [ ] `openapi.yaml` no longer documents the removed version.
- [ ] `/api/versions` no longer lists it as supported.
