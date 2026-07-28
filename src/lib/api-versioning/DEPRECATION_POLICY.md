# API Versioning — Deprecation Policy

## Route architecture

Unversioned routes (`/api/offramp/*`) contain **all business logic**.
Versioned routes (`/api/v1/offramp/*`) are **thin adapters** that:

1. Apply API-key authentication via `withApiKeyAuth`.
2. Re-export the unversioned handler verbatim.

No business logic lives in versioned routes. Adding or fixing a behaviour
only requires touching the unversioned handler.

```ts
// Example: src/app/api/v1/offramp/quote/route.ts
import { NextRequest } from 'next/server';
import { POST as basePOST } from '@/app/api/offramp/quote/route';
import { withApiKeyAuth } from '@/lib/api-keys/auth';

export async function POST(request: NextRequest) {
  return withApiKeyAuth(request, async () => basePOST(request));
}
```

## Lifecycle stages

| Stage        | Meaning                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `supported`  | Fully maintained; no breaking changes without a new version.                                                                          |
| `deprecated` | Announces a sunset date; clients have at least **6 months** to migrate. Response carries `Deprecation`, `Sunset`, and `Link` headers. |
| `sunset`     | The `sunsetAt` date has passed; the route returns `410 Gone`.                                                                         |

## Adding a new version

1. Create `src/app/api/v2/offramp/<route>/route.ts` as a thin adapter.
2. Add a `v2` entry to `VERSION_REGISTRY_DATA` in `registry.ts`.
3. Update `negotiator.ts` if new header-based negotiation rules are needed.

## Deprecating an existing version

Update the registry entry:

```ts
{
  version: 'v1',
  status: 'deprecated',
  prefix: '/api/v1',
  deprecatedAt: '2026-07-01T00:00:00Z',   // ISO 8601
  sunsetAt:     '2027-01-01T00:00:00Z',   // ≥ 6 months after deprecatedAt
  migrationGuideUrl: '/docs/migrate-v1-to-v2',
}
```

The `headerInjector.addDeprecationHeaders()` middleware will automatically
inject the `Deprecation`, `Sunset`, and `Link` response headers once the
entry is marked deprecated.

## Unversioned routes

Unversioned routes (`/api/offramp/*`) are considered **internal/legacy** and
are not part of the public API contract. They will be removed once `v2` is
stable. Clients should always use a versioned base path.
