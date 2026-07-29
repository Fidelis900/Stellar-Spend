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

| Target            | Location                                                |
| ----------------- | ------------------------------------------------------- |
| Library / utility | `src/lib/**/*.test.ts`                                  |
| React component   | `src/test/*.test.tsx` or `src/app/__tests__/*.test.tsx` |
| API route handler | `src/test/*.test.ts`                                    |

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
    public: {
      /* ... */
    },
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

| Layer                | Target                                                  |
| -------------------- | ------------------------------------------------------- |
| `src/lib/` utilities | ≥ 80% line coverage                                     |
| API route handlers   | All happy-path + primary error branches covered         |
| React components     | Key render states and user interactions covered         |
| E2E                  | Critical user journey (load → connect → submit) covered |

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

## OpenAPI Contract Tests (Issue #834)

Contract tests live in `src/test/contract/openapi-contract.test.ts` and run automatically as part of `npm test`.

### What they verify

- Every route handler's response conforms to the schema in `openapi.yaml`.
- Required fields are present (`required: [...]` in the spec is enforced via AJV).
- The `Error` schema's `error` enum only contains documented codes.
- No undocumented top-level fields drift into responses (`additionalProperties: false` applied structurally).
- All `$ref` targets in `components/schemas` resolve without errors (orphaned refs are caught).

### Running just the contract tests

```bash
npx vitest --run src/test/contract/openapi-contract.test.ts
```

### Updating `openapi.yaml` when the backend contract changes

1. **Add / change an endpoint:** edit the relevant `paths` entry in `openapi.yaml`.
2. **Add / change a response schema:** edit the corresponding entry in `components/schemas`.
3. **Regenerate from routes (optional):** if your team uses `openapi-typescript` or a similar generator, run it and then diff `openapi.yaml` to confirm the changes are intentional:

   ```bash
   # Example with openapi-typescript (install separately if needed)
   npx openapi-typescript openapi.yaml -o src/types/api.d.ts
   ```

4. **Run the contract suite** to confirm no regressions:

   ```bash
   npx vitest --run src/test/contract/openapi-contract.test.ts
   ```

5. **Commit both** the updated `openapi.yaml` and any affected source files together so the spec stays in sync with the implementation.

### AJV dependency

The contract tests rely on `ajv` and `ajv-formats`, which are already present in `devDependencies`. If they are ever removed, add them back:

```bash
npm install --save-dev ajv ajv-formats js-yaml
```

---

## Mutation Testing with Stryker (Issue #833)

Mutation tests measure whether the unit-test suite can catch code changes (mutations) to library logic.

### Running mutation tests

```bash
npm run test:mutation
```

This invokes `stryker run` using `stryker.conf.json`. The HTML report is written to `./mutation-report/index.html`.

### Mutation score targets

| Threshold        | Value  |
| ---------------- | ------ |
| High (green)     | ≥ 80 % |
| Medium (yellow)  | ≥ 70 % |
| Low (orange)     | ≥ 60 % |
| Break (CI fails) | < 55 % |

### Files mutated by Stryker

Stryker mutates `src/lib/**/*.ts` and `src/app/api/**/*.ts` (see `stryker.conf.json`). The following test files provide coverage that kills mutants:

| Test file                                  | Target lib modules                                                 |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `src/test/mutation.test.ts`                | `fee-calculation`, `error-types`, `paycrest-adapter`, `kyc-limits` |
| `src/test/mutation-critical-paths.test.ts` | `http-client`, `cache/keys`                                        |
| `src/test/fee-calculation.test.ts`         | `fee-calculation` (full coverage)                                  |
| `src/test/error-types.test.ts`             | `error-types`                                                      |
| `src/test/mapPaycrestStatus.test.ts`       | `paycrest-adapter`                                                 |

### Improving the mutation score

When Stryker reports a surviving mutant:

1. Open `./mutation-report/index.html` and find the surviving mutant.
2. Identify which assertion was too weak to catch it (e.g. `toBeTruthy` instead of `toBe(true)`).
3. Add a focused test that asserts the exact value a mutant would change.
4. Re-run `npm run test:mutation` to confirm the score improved.

---

## E2E Testing with Playwright (Issues #831 & #832)

### Overview of E2E specs

| Spec file                                | Issue     | Coverage                                                        |
| ---------------------------------------- | --------- | --------------------------------------------------------------- |
| `e2e/payment-flow.spec.ts`               | #831 (P0) | Connect wallet → amount → quote → recipient → confirm → history |
| `e2e/kyc-rejection-resubmission.spec.ts` | #832      | Unverified → submit → rejected → resubmit → approved lifecycle  |
| `e2e/smoke.spec.ts`                      | —         | Production smoke: health, currencies, rate, UI load             |
| `e2e/critical-journeys.spec.ts`          | —         | Full offramp with axe accessibility checks                      |
| `e2e/transaction-history.spec.ts`        | —         | History display, filter, search, export                         |

### Running E2E tests locally

> **Prerequisite:** The app must be running on `http://localhost:3001`. All external dependencies are mocked inside each spec via `page.route()` — no real API keys are required.

```bash
# Build and start the server (first run)
npm run build && npm start &

# Or use the dev server (faster iteration)
npm run dev &

# Run all E2E tests
npm run test:e2e

# Run a single spec file
npx playwright test e2e/payment-flow.spec.ts

# Run KYC spec only
npx playwright test e2e/kyc-rejection-resubmission.spec.ts

# Run headless with visible browser for debugging
npx playwright test --headed e2e/payment-flow.spec.ts

# Open the HTML report after a run
npx playwright show-report
```

### Running in CI

CI sets `CI=true` which enables:

- 2 retries on flaky tests
- Single worker (serial execution)
- `forbidOnly` (test.only fails the run)
- HTML report saved as an artifact

```yaml
# Example GitHub Actions step
- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
    BASE_URL: http://localhost:3001
```

### Mocking strategy in E2E tests

**Wallet (Freighter):** stubbed via `page.addInitScript()` before navigation. The stub auto-approves all `signTransaction` calls and returns a deterministic public key.

**API endpoints:** mocked via `page.route('**/api/...**', ...)` at the top of each `beforeEach`. This intercepts all matching fetch/XHR calls and returns JSON fixtures without touching the network.

**Transaction history (localStorage):** seeded via `page.addInitScript()` using `localStorage.setItem` before the page loads.

### Writing new E2E tests

Use the patterns established in `e2e/payment-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';

test.beforeEach(async ({ page }) => {
  // 1. Stub wallet
  await page.addInitScript(() => {
    (window as any).freighter = {
      isConnected: async () => true,
      getPublicKey: async () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      signTransaction: async (xdr: string) => xdr,
    };
  });

  // 2. Mock APIs
  await page.route('**/api/offramp/quote**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ destinationAmount: '158200.00', rate: 1582, currency: 'NGN' }),
    }),
  );
});

test('my new scenario', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  // ... assertions ...
});
```

### KYC fixtures

Structured test data for KYC flows is in `e2e/fixtures/kyc-fixtures.ts`:

```ts
import { KYC_USERS, KYC_REJECTION_REASONS, KYC_API_RESPONSES } from './fixtures/kyc-fixtures';

// Use pre-built rejection API responses in page.route():
await page.route('**/api/kyc**', (route) =>
  route.fulfill({
    status: 200,
    body: JSON.stringify(KYC_API_RESPONSES.getRejected('documentUnreadable')),
  }),
);
```
