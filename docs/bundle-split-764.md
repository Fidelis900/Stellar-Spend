# Bundle Size — Admin Code-Splitting (#764)

## Problem

Admin-adjacent and infrequently-used UI components (`KYCLimitManager`,
`InsuranceClaimForm`) were statically imported at the top of their parent
pages. This bundled them into the page's initial JS chunk even though they are
only rendered on a specific user action or tab selection.

## Changes

| File | Component | Before | After |
|------|-----------|--------|-------|
| `src/app/settings/page.tsx` | `KYCLimitManager` | static import | `next/dynamic` (ssr: false) |
| `src/app/history/page.tsx` | `InsuranceClaimForm` | static import | `next/dynamic` (ssr: false) |

Both components are replaced with `next/dynamic` lazy wrappers that show a
lightweight skeleton while the real module loads asynchronously.

## Why These Components

- **`KYCLimitManager`** — rendered only when the user navigates to the
  *Security* tab of Settings. It pulls in `@/lib/kyc-limits`,
  `@/lib/bank-validation`, and `@/lib/corridor-config` which are sizable
  modules not needed on any other page.

- **`InsuranceClaimForm`** — rendered only when the user clicks *"File Claim"*
  on a specific transaction. It pulls in insurance logic and form validation
  not needed for the common read-only history view.

## Measuring the Improvement

```bash
# Build and analyse before
ANALYZE=true npm run build

# Apply changes, then rebuild and compare
ANALYZE=true npm run build
```

Open the `.next/analyze/client.html` report and compare the chunk sizes for
`chunks/pages/settings` and `chunks/pages/history` before and after.

Expected reduction: removing `KYCLimitManager` from the settings page initial
chunk (~30–50 KB gzipped) and `InsuranceClaimForm` from the history page
initial chunk (~20–35 KB gzipped).

## Existing Infrastructure

`src/lib/code-splitting.tsx` already provides `dynamicComponent()`,
`preloadModule()`, and `routeChunks` / `featureChunks` registries. New
admin-adjacent components that are not needed on first paint should be added
there and consumed via `next/dynamic` or `routeChunks`.
