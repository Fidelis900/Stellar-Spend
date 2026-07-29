# Testing Guide

This document covers how to write and run tests for Stellar-Spend.

---

## Table of Contents

1. [Running Tests](#running-tests)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [E2E Testing with Playwright](#e2e-testing-with-playwright)
5. [Test Coverage](#test-coverage)
6. [Mocking Strategies](#mocking-strategies)

---

## Running Tests

```bash
# Run all unit/integration tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Run E2E tests
npm run test:e2e
```

---

## Unit Testing

Unit tests use **Vitest** + **React Testing Library** and live alongside the code they test.

### File conventions

| Target | Location |
|---|---|
| Library / utility | `src/lib/**/*.test.ts` |
| React component | `src/test/*.test.tsx` or `src/app/__tests__/*.test.tsx` |
| API route handler | `src/test/*.test.ts` |

### Setup

`src/test/setup.ts` is loaded before every suite and imports `@testing-library/jest-dom` matchers (e.g. `toBeInTheDocument`, `toHaveValue`).

### Writing a unit test

```ts
import { describe, it, expect } from 'vitest';
import { validateAmount } from '@/lib/offramp/utils/validation';

describe('validateAmount', () => {
  it('returns true for a valid positive number', () => {
    expect(validateAmount('10.5')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(validateAmount('')).toBe(false);
  });
});
```

### Writing a component test

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '@/components/Header';

describe('Header', () => {
  it('renders the connect wallet button when disconnected', () => {
    render(<Header isConnected={false} onConnect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });
});
```

---

## Integration Testing

Integration tests verify that multiple modules work together — for example, an API route handler calling real service logic with mocked external dependencies.

### Pattern

1. Import the Next.js route handler directly.
2. Construct a `NextRequest` with the required body/params.
3. Mock only the external boundary (SDK, env, network).
4. Assert the `Response` status and JSON body.

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  env: {
    server: { PAYCREST_API_KEY: 'test-key' /* ... */ },
    public: { /* ... */ },
  },
}));

const { POST } = await import('@/app/api/offramp/quote/route');

describe('POST /api/offramp/quote', () => {
  it('returns 400 for a missing amount', async () => {
    const req = new NextRequest('http://localhost/api/offramp/quote', {
      method: 'POST',
      body: JSON.stringify({ currency: 'NGN' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

---

## E2E Testing with Playwright

E2E tests live in `./e2e/` and run against a real dev server on `http://localhost:3001`.

### Configuration highlights (`playwright.config.ts`)

- Browser: Chromium (Desktop Chrome)
- Base URL: `http://localhost:3001`
- CI: 2 retries, 1 worker, `forbidOnly` enabled
- Traces captured on first retry for debugging

### Running locally

```bash
# Starts the dev server automatically, then runs tests
npm run test:e2e

# Run a specific spec file
npx playwright test e2e/smoke.spec.ts

# Open the HTML report after a run
npx playwright show-report
```

### Writing an E2E test

```ts
import { test, expect } from '@playwright/test';

test.describe('Off-ramp flow', () => {
  test('page loads with correct title and connect button', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stellar-Spend/i);
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
  });
});
```

### Wallet interactions

Freighter and Lobstr are browser extensions and cannot be installed in Playwright's Chromium. For flows that require a connected wallet, stub `window.freighter` / `window.lobstr` via `page.addInitScript` before navigation.

---

## Test Coverage

Coverage is not enforced by a hard threshold today, but the following targets are expected:

| Layer | Target |
|---|---|
| `src/lib/` utilities | ≥ 80% line coverage |
| API route handlers | All happy-path + primary error branches covered |
| React components | Key render states and user interactions covered |
| E2E | Critical user journey (load → connect → submit) covered |

To generate a coverage report locally:

```bash
npx vitest run --coverage
```

> Coverage output is written to `./coverage/`. The directory is git-ignored.

---

## Mocking Strategies

### Environment variables

Always mock `@/lib/env` rather than setting `process.env` directly to keep tests hermetic.

```ts
vi.mock('@/lib/env', () => ({
  env: {
    server: {
      PAYCREST_API_KEY: 'test-api-key',
      PAYCREST_WEBHOOK_SECRET: 'test-secret',
      BASE_PRIVATE_KEY: '0xdeadbeef',
      BASE_RETURN_ADDRESS: '0xreturn',
      BASE_RPC_URL: 'https://base-rpc.test',
      STELLAR_SOROBAN_RPC_URL: 'https://soroban.test',
      STELLAR_HORIZON_URL: 'https://horizon.test',
    },
    public: {
      NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL: 'https://soroban.test',
      NEXT_PUBLIC_BASE_RETURN_ADDRESS: '0xreturn',
      NEXT_PUBLIC_STELLAR_USDC_ISSUER: 'GISSUER',
    },
  },
}));
```

### External SDKs (Allbridge, Stellar, viem)

Mock the SDK class/module at the top of the test file with minimal fake data.

```ts
vi.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: class {
    chainDetailsMap = vi.fn();
    buildSwapAndBridgeTx = vi.fn().mockResolvedValue({ tx: 'fake-xdr' });
  },
  nodeRpcUrlsDefault: {},
}));
```

### Rate limiter

```ts
vi.mock('@/lib/offramp/utils/rate-limiter', () => ({
  buildTxLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => '127.0.0.1',
}));
```

### React component callbacks

Use `vi.fn()` for all callback props and assert with `toHaveBeenCalledWith`.

```ts
const onSubmit = vi.fn();
render(<FormCard {...baseProps} onSubmit={onSubmit} />);
await userEvent.click(screen.getByRole('button', { name: /submit/i }));
expect(onSubmit).toHaveBeenCalledOnce();
```

### `localStorage`

`jsdom` provides a real `localStorage` implementation. Clear it in `beforeEach` to prevent cross-test pollution.

```ts
beforeEach(() => localStorage.clear());
```

---

## Snapshot Testing Policy

Snapshot tests capture the rendered output of a component or the return value of a formatter and fail when the output changes unexpectedly. They are a low-cost regression net — but only when maintained deliberately. This section defines how to use them correctly in Stellar-Spend.

---

### Inventory of current snapshot files

| Snapshot file | Suite | Status |
|---|---|---|
| `src/test/__snapshots__/DataTable.test.tsx.snap` | `DataTable > matches the snapshot for a basic render` | ✅ Active — covers desktop table + mobile card layout |
| `src/lib/__snapshots__/formatters.test.ts.snap` | `DateFormatter` and `helper functions` suites | ⚠️ Potentially stale — date strings (`Jul 25, 2025`) are hardcoded relative to a fixed test date; verify `formatters.test.ts` still passes with the frozen date |

Snapshot utility helpers live in `src/test/snapshots/snapshot-utils.tsx` (not a test file — imported by test suites that need custom rendering helpers).

---

### When TO use snapshots

Use snapshots to guard against unintended structural regressions in:

- **Component markup** — rendered HTML structure of a UI component (element hierarchy, CSS class names, ARIA roles/attributes). The `DataTable` snapshot is a good example.
- **Formatter / serialiser output** — pure functions that produce stable string representations of data (e.g. `DateFormatter.formatTimestamp`).
- **API response shapes** — the JSON body of route handlers that have a fixed, documented contract.
- **Complex composite renders** — components that compose many sub-components where a full structural audit in assertions would be unreasonably verbose.

The key criterion: **the output must be deterministic given the same inputs.**

---

### When NOT to use snapshots

Avoid snapshots when the output is inherently volatile or when assertions would be meaningless noise:

| Scenario | Reason to avoid |
|---|---|
| Timestamps from `Date.now()` / `new Date()` | Output changes every run; snapshot will fail on every CI run unless the clock is frozen |
| UUIDs, random IDs, nonces | Non-deterministic by design |
| Network-fetched data (prices, exchange rates) | Live values differ between runs |
| Animation or transition state | Intermediate states are not testable reliably |
| Deeply nested third-party component internals | Upstream library updates break your snapshot without any change to your code |
| Large, frequently-changing components | Every innocuous UI tweak forces a snapshot update, making reviews noisy and meaningless |

If the data is dynamic, freeze it: use `vi.useFakeTimers()` with a fixed date or mock the data source before creating the snapshot.

---

### How to regenerate snapshots

When a component intentionally changes and the snapshot is legitimately out of date, update it with:

```bash
npx vitest run --update-snapshots
```

To update snapshots for a single test file only:

```bash
npx vitest run --update-snapshots src/test/DataTable.test.tsx
```

To update snapshots for a single test suite interactively:

```bash
npx vitest --ui
# then press 'u' on the failing snapshot in the UI
```

> ⚠️ **Never commit snapshot updates blindly.** Always read the diff before staging the file — see the staleness check procedure below.

---

### Staleness check procedure

Run this procedure before opening or merging any PR that touches components or formatters:

1. **Run tests in CI mode** (no watch, no update):
   ```bash
   npm test
   ```
2. **If snapshot tests fail**, inspect the diff output in the terminal. Vitest prints the expected vs. received diff inline.
3. **Decide deliberately**:
   - If the diff represents an _intentional_ change (you changed the component) → update the snapshot (see above) and include the updated `.snap` file in your PR.
   - If the diff represents an _unintentional_ change (the component regressed) → fix the code, not the snapshot.
4. **After updating**, review the full `.snap` file content — not just the diff — to confirm the new snapshot is correct.
5. **Stage snapshot files explicitly** (`git add src/test/__snapshots__/DataTable.test.tsx.snap`) rather than via `git add .` to avoid accidentally committing unrelated changes.

---

### Review checklist for snapshot changes in PRs

Before approving a PR that contains changes to any `.snap` file, the reviewer MUST verify each of the following:

- [ ] **The diff is readable.** The changed lines in the `.snap` file correspond to documented, intentional changes described in the PR body.
- [ ] **The snapshot is deterministic.** No timestamps, random IDs, or live network data appear in the new snapshot content.
- [ ] **The new structure is correct.** The rendered HTML/string in the snapshot matches what you would expect from reading the component source.
- [ ] **No accidental removals.** Existing snapshot keys have not been silently deleted without a corresponding removal of the test.
- [ ] **ARIA attributes are preserved.** Accessibility-relevant attributes (`role`, `aria-label`, `aria-sort`, `scope`) must still be present if they were in the previous snapshot.
- [ ] **Class names are intentional.** If Tailwind class strings changed, confirm the design change was deliberate.
- [ ] **The test still runs.** The PR should include CI evidence (green check or attached log) that all snapshot tests pass with the new `.snap` file.

---

### Policy: manual review is mandatory

> **Auto-approving snapshot changes without review is prohibited.**

Snapshot `.snap` files are part of the test contract. They must be treated with the same scrutiny as production code changes. Specifically:

- Do not approve a PR that modifies `.snap` files without reading the diff.
- Do not merge a PR with snapshot changes solely because CI is green. CI only checks that the saved snapshot matches the current output — it does not verify that the current output is _correct_.
- If a snapshot update is large (more than ~20 lines changed), request that the author break the PR into smaller units or provide a visual screenshot of the before/after component.
- If you are the author, add a comment in the PR body explaining _why_ the snapshot changed and attaching a screenshot if the change is visual.

---

### CI enforcement

The CI pipeline (`npm test`) runs Vitest **without** `--update-snapshots`. Any snapshot mismatch causes a non-zero exit and fails the build. This means:

- Stale snapshot files that do not reflect the current component output will block merging.
- Snapshot files must be committed and kept up to date; `.snap` files are **not** git-ignored.
- If a new component test introduces a snapshot, the initial `.snap` file must be committed in the same PR as the test.

To verify snapshot health locally before pushing:

```bash
npm test
# All snapshot tests should pass with exit code 0.
# A failing snapshot means either the component regressed or the snapshot is stale.
```

> The `scripts/check-diagrams.sh` CI script does not cover snapshot validation. Snapshot CI enforcement is handled entirely by the Vitest run in the `test` job.
