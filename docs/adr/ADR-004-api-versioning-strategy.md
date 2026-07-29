# ADR-004: API Versioning Strategy (v1 vs Legacy)

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Stellar-Spend core team

---

## Context

The initial Stellar-Spend API used unversioned routes (`/api/offramp/*`, `/api/health`, etc.). As the project began onboarding programmatic API consumers (partners using API keys), it became necessary to:

1. Guarantee API stability for external consumers who cannot update clients immediately.
2. Introduce breaking changes safely without disrupting existing integrations.
3. Provide a clear discovery mechanism so clients know which versions are supported.

Options considered:

1. **URL-path versioning** (`/api/v1/`, `/api/v2/`) — explicit, cacheable, easy to route, widely understood.
2. **Header versioning** (`X-API-Version: 1`) — no URL changes for clients, but harder to cache and debug.
3. **Content-type negotiation** (`Accept: application/vnd.stellarspend.v1+json`) — RESTful, but uncommon in practice and hard for most HTTP clients.
4. **Hybrid** — URL-path as primary with header fallback — combines flexibility with explicit routing.

---

## Decision

A **hybrid URL-path + header** versioning strategy was adopted:

**Primary (recommended):** URL-path prefix

```
GET /api/v1/offramp/quote
```

**Fallback (header-based):**

```
GET /api/offramp/quote
X-API-Version: 1
```

**Content-type negotiation (also supported):**

```
GET /api/offramp/quote
Accept: application/vnd.stellarspend.v1+json
```

URL prefix takes precedence over headers. Requests with no version indicator default to v1 (the current stable version).

Version negotiation is handled by `src/lib/api-versioning/negotiator.ts`. The active version registry lives in `src/lib/api-versioning/registry.ts`.

**Deprecation policy:**

- Legacy unversioned routes (`/api/*`) were deprecated on **2025-01-01**.
- They will be removed on **2026-01-01**.
- Deprecated routes return three response headers:
  ```
  Deprecation: 2025-01-01
  Sunset: 2026-01-01
  Link: </api/v1/{path}>; rel="successor-version"
  ```

**Version discovery:**

```
GET /api/versions
```

Returns all supported versions with their status and path prefix.

---

## Consequences

**Positive:**

- Existing clients continue to work without changes during the deprecation window.
- Programmatic clients can pin to `/api/v1/` for guaranteed stability.
- Version discovery endpoint enables automated client tooling to detect supported versions.
- Deprecation headers give integrators machine-readable sunset information.

**Negative / Trade-offs:**

- Maintaining two parallel route trees (`/api/` and `/api/v1/`) doubles the number of route files during the transition period.
- The hybrid approach requires clients to understand three different version-signaling mechanisms, though only one (URL prefix) is recommended.
- Removing legacy routes in 2026 will require active communication to any remaining unversioned consumers.

**Conventions:**

- All new features are added only to the versioned routes (`/api/v1/`).
- Bug fixes affecting both trees are applied to both until legacy routes are sunset.
- Version middleware (`src/lib/api-versioning/`) handles negotiation transparently; route files do not contain versioning logic.

---

_Related: [[ADR-005-environment-variable-validation]], [[ADR-003-adapter-pattern-external-services]]_
