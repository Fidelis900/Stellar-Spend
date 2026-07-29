# Testing Strategy

This document describes the full testing approach for Stellar-Spend — tooling, layer responsibilities, coverage requirements, mocking patterns, and the CI/CD pipeline.

---

## Table of Contents

1. [Overview](#overview)
2. [Test Pyramid](#test-pyramid)
3. [Unit Testing with Vitest](#unit-testing-with-vitest)
4. [Integration Testing](#integration-testing)
5. [E2E Testing with Playwright](#e2e-testing-with-playwright)
6. [Contract Testing (Soroban)](#contract-testing-soroban)
7. [Mutation Testing](#mutation-testing)
8. [Accessibility Testing](#accessibility-testing)
9. [Chaos Engineering Tests](#chaos-engineering-tests)
10. [Test Coverage Requirements](#test-coverage-requirements)
11. [Fixtures & Mock Conventions](#fixtures--mock-conventions)
12. [Mocking External Services](#mocking-external-services)
13. [How to Write a Good Test](#how-to-write-a-good-test)
14. [CI/CD Testing Pipeline](#cicd-testing-pipeline)

---

## Overview

Stellar-Spend uses a layered test strategy:

| Layer         | Tool                           | Scope                               |
| ------------- | ------------------------------ | ----------------------------------- |
| Unit          | Vitest + React Testing Library | Individual functions and components |
| Integration   | Vitest                         | Route handlers + real service logic |
| E2E           | Playwright                     | Full browser flows                  |
| Mutation      | Vitest (mutation config)       | Test suite quality                  |
| Accessibility | axe-core / ARIA assertions     | WCAG compliance                     |
| Chaos         | Vitest (chaos suite)           | Resilience under failure            |

Run all checks:

```bash
npm test               # Unit + integration (single run)
npm run test:watch     # Watch mode for development
npm run test:e2e       # Playwright E2E suite
```

---

## Test Pyramid

```
              /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
             /  E2E (Playwright)           \
            /  ~20 flows · slowest          \
           /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
          /  Integration (Vitest)            \
         /  Route handlers + real services    \
        /  ~80 tests · medium speed           \
       /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
      /  Unit (Vitest + RTL)                   \
     /  Functions, components, hooks            \
    /  ~400+ tests · fastest                    \
   /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
  /  Contract (cargo test)                        \
 /  Soroban smart contracts (on-chain logic)       \
/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
```

| Layer       | Location                                      | Tool                           | When to write                                      |
| ----------- | --------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Unit        | `src/lib/**/*.test.ts`, `src/test/*.test.tsx` | Vitest + React Testing Library | Any new function, hook, or component               |
| Integration | `src/test/integration/`                       | Vitest                         | Any new or changed API route handler               |
| E2E         | `e2e/`                                        | Playwright                     | Critical user journeys (connect → send → complete) |
| Contract    | `contracts/*/tests/`                          | `cargo test`                   | Any Soroban contract logic change                  |
| Mutation    | `vitest.mutation.config.ts`                   | Vitest coverage                | Periodic quality audits; run before releases       |
| Chaos       | `src/test/chaos-engineering.test.ts`          | Vitest                         | Resilience scenarios for external service failures |

**Rule of thumb:** prefer more unit tests and fewer E2E tests. If something can be tested at the unit level, do not rely solely on E2E coverage for it.

---

## Unit Testing with Vitest

### Configuration

Unit tests use **Vitest** with `jsdom` as the environment, configured in `vitest.config.ts`:

- Environment: `jsdom`
- Globals enabled (no need to import `describe`, `it`, `expect`)
- Setup file: `src/test/setup.ts` (loads `@testing-library/jest-dom` matchers)
- Path alias: `@` → `src/`

### File conventions

| Target            | Location                                                |
| ----------------- | ------------------------------------------------------- |
| Library / utility | `src/lib/**/*.test.ts`                                  |
| React component   | `src/test/*.test.tsx` or `src/app/__tests__/*.test.tsx` |
| API route handler | `src/test/*.test.ts`                                    |

### Writing a utility test

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

  it('returns false for negative values', () => {
    expect(validateAmount('-5')).toBe(false);
  });
});
```

### Writing a component test

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '@/components/Header';

describe('Header', () => {
  it('renders the connect wallet button when disconnected', () => {
    render(<Header isConnected={false} onConnect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });

  it('calls onConnect when the button is clicked', async () => {
    const onConnect = vi.fn();
    render(<Header isConnected={false} onConnect={onConnect} />);
    await userEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});
```

### Running unit tests

```bash
npm test                              # Single run
npm run test:watch                    # Watch mode
npx vitest run --reporter=verbose     # Verbose output
npx vitest run src/lib/currencies     # Run a specific file/pattern
npx vitest run --coverage             # With coverage report
```

---

## Integration Testing

Integration tests verify that multiple modules work together — typically a Next.js route handler calling real service logic with only the external boundary mocked.

### Pattern

1. Import the route handler directly (`await import('@/app/api/...')`).
2. Construct a `NextRequest` with the required method, headers, and body.
3. Mock only the external boundary: SDK, database, environment variables.
4. Assert the `Response` status code and JSON body.

### Example

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  env: {
    server: {
      PAYCREST_API_KEY: 'test-key',
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

const { POST } = await import('@/app/api/offramp/quote/route');

describe('POST /api/offramp/quote', () => {
  it('returns 400 when amount is missing', async () => {
    const req = new NextRequest('http://localhost/api/offramp/quote', {
      method: 'POST',
      body: JSON.stringify({ currency: 'NGN' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with a valid quote for correct input', async () => {
    const req = new NextRequest('http://localhost/api/offramp/quote', {
      method: 'POST',
      body: JSON.stringify({ amount: '10', currency: 'NGN' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('rate');
  });
});
```

### Integration test locations

```
src/test/integration/
├── paycrest-order.integration.test.ts
└── bridge-build-tx.integration.test.ts
```

---

## E2E Testing with Playwright

### Configuration highlights (`playwright.config.ts`)

| Setting        | Value                                               |
| -------------- | --------------------------------------------------- |
| Test directory | `./e2e/`                                            |
| Base URL       | `http://localhost:3001`                             |
| Browser        | Chromium (Desktop Chrome)                           |
| CI retries     | 2                                                   |
| CI workers     | 1 (sequential)                                      |
| Local workers  | Unbounded (parallel)                                |
| Traces         | Captured on first retry                             |
| Web server     | `npm run dev` — auto-started if not already running |

### Running E2E tests

```bash
# Full suite (starts dev server automatically)
npm run test:e2e

# Run a single spec file
npx playwright test e2e/smoke.spec.ts

# Run in headed mode (visible browser)
npx playwright test --headed

# Debug a specific test interactively
npx playwright test --debug e2e/offramp.spec.ts

# Open the HTML report after a run
npx playwright show-report
```

### Writing an E2E test

```ts
import { test, expect } from '@playwright/test';

test.describe('Off-ramp flow', () => {
  test('page loads with title and connect wallet button', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stellar-Spend/i);
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
  });

  test('history page shows empty state for new user', async ({ page }) => {
    await page.goto('/history');
    await expect(page.getByText(/no transactions/i)).toBeVisible();
  });
});
```

### Wallet interactions

Freighter and Lobstr are browser extensions and cannot be installed in Playwright's Chromium. Stub `window.freighter` / `window.lobstr` via `page.addInitScript` before navigation:

```ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).freighter = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve('GFAKE...PUBLICKEY'),
      signTransaction: (xdr: string) => Promise.resolve(xdr),
    };
  });
});
```

### Accessibility checks in E2E

Use the `@axe-core/playwright` package to run automated accessibility scans during E2E runs:

```ts
import AxeBuilder from '@axe-core/playwright';

test('home page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

---

## Contract Testing (Soroban)

Soroban smart contracts are written in Rust and live in `contracts/`. Each contract has a `tests/` directory using the standard `cargo test` harness with `soroban-sdk`'s test utilities.

### Running contract tests

```bash
# Run all contract tests
cd contracts/escrow && cargo test
cd contracts/fee-manager && cargo test
cd contracts/treasury && cargo test

# Run a specific test
cargo test test_release_flow -- --nocapture
```

### Contract test structure

Each contract test file (`contracts/*/tests/integration.rs`) follows this pattern:

```rust
#[cfg(test)]
mod tests {
    use soroban_sdk::{Env, Address, testutils::Address as _};
    use crate::EscrowContract;

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let depositor = Address::generate(&env);
        (env, contract_id, depositor)
    }

    #[test]
    fn test_release_flow() {
        let (env, contract_id, depositor) = setup();
        let client = EscrowContractClient::new(&env, &contract_id);
        // ... test release happy path
    }

    #[test]
    fn test_refund_after_timeout() {
        // ...
    }
}
```

### What to test in contracts

| Scenario                            | Why                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Happy path for each public function | Verify intended behavior                                                            |
| State machine transitions           | Ensure only valid state changes are accepted                                        |
| Authorization checks                | Confirm unauthorized callers are rejected                                           |
| Timeout boundary conditions         | Verify timeout math at `timeout_ledger - 1`, `timeout_ledger`, `timeout_ledger + 1` |
| Double-release / double-refund      | Confirm mutual exclusion is enforced                                                |
| Deposit ID uniqueness               | Confirm duplicate IDs are rejected                                                  |
| Fee calculation tiers               | Verify fee schedules at tier boundaries                                             |

### CI integration

Contract tests run via `.github/workflows/contract.yml` on every push to branches touching `contracts/`. The workflow:

```yaml
- name: Run contract tests
  run: cargo test --manifest-path contracts/escrow/Cargo.toml
```

Contract tests do **not** require a live Stellar network — `Env::default()` provides a fully mocked Soroban environment.

---

## Mutation Testing

Mutation testing verifies the quality of your test suite by introducing deliberate bugs (mutations) into source code and checking that tests catch them.

### Configuration (`vitest.mutation.config.ts`)

The mutation config extends the base Vitest setup with V8 coverage enabled:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: ['node_modules/', 'src/test/', '**/*.test.ts', '**/*.test.tsx'],
}
```

### Running mutation tests

```bash
npx vitest run --config vitest.mutation.config.ts --coverage
```

Coverage output is written to `./coverage/` (git-ignored). Open `./coverage/index.html` in a browser for the interactive report.

### Interpreting results

A **mutation score** below 60% indicates the test suite is too permissive — it allows incorrect logic to pass undetected. Aim for:

| Layer                                    | Target mutation score |
| ---------------------------------------- | --------------------- |
| `src/lib/` utilities                     | ≥ 80%                 |
| API route handlers                       | ≥ 70%                 |
| Business logic (`offramp/`, `api-keys/`) | ≥ 75%                 |

### Improving mutation scores

- Add **boundary tests**: check `n - 1`, `n`, `n + 1` for numeric limits.
- Assert **exact values**, not just truthiness.
- Cover every branch in conditional logic.
- Test error paths explicitly, not just happy paths.

---

## Accessibility Testing

### Component-level (unit tests)

Use `@testing-library/jest-dom` ARIA matchers to assert accessible markup:

```tsx
it('form fields have accessible labels', () => {
  render(<AmountInput />);
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
});

it('error message is associated with its input via aria-describedby', () => {
  render(<AmountInput error="Invalid amount" />);
  const input = screen.getByRole('textbox');
  expect(input).toHaveAttribute('aria-describedby');
  const errorId = input.getAttribute('aria-describedby')!;
  expect(document.getElementById(errorId)).toHaveTextContent('Invalid amount');
});
```

### Keyboard navigation

```tsx
it('modal can be dismissed with the Escape key', async () => {
  render(<Modal isOpen onClose={vi.fn()} />);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('focus is trapped inside an open modal', async () => {
  render(<Modal isOpen onClose={vi.fn()} />);
  const focusable = screen.getAllByRole('button');
  await userEvent.tab();
  expect(focusable[0]).toHaveFocus();
  // Tab through all elements and confirm focus wraps
});
```

### ARIA labels (`src/lib/aria-labels.ts`)

The project centralises all ARIA label strings in `src/lib/aria-labels.ts`. Always source labels from there rather than hard-coding strings in components, so a single change propagates everywhere.

### Automated axe scans

See the [E2E section](#accessibility-checks-in-e2e) for running axe-core scans as part of the Playwright suite.

---

## Chaos Engineering Tests

Chaos tests live in `src/test/chaos-engineering.test.ts` and verify that the application degrades gracefully under adverse conditions rather than crashing or exposing errors to users.

### What chaos tests cover

| Scenario                              | Expected behaviour                                                  |
| ------------------------------------- | ------------------------------------------------------------------- |
| External SDK throws unexpectedly      | Route returns `500` with a structured error, no unhandled rejection |
| Database connection drops mid-request | Graceful error response, no leaked connection                       |
| Rate limiter hit                      | `429` response with `Retry-After` header                            |
| Malformed JSON body                   | `400` response with actionable message                              |
| Timeout on downstream service         | `504` or `503` with retry guidance                                  |
| Missing environment variable          | Startup validation error, server does not start                     |

### Example chaos test

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: class {
    chainDetailsMap = vi.fn().mockRejectedValue(new Error('SDK chaos failure'));
  },
  nodeRpcUrlsDefault: {},
}));

const { POST } = await import('@/app/api/offramp/bridge/build-tx/route');

describe('chaos: bridge SDK failure', () => {
  it('returns 500 without leaking the internal error message', async () => {
    const req = new NextRequest('http://localhost/api/offramp/bridge/build-tx', {
      method: 'POST',
      body: JSON.stringify({ amount: '10', sourceChain: 'STELLAR' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).not.toContain('SDK chaos failure');
  });
});
```

---

## Test Coverage Requirements

Coverage is collected with the V8 provider via `vitest.mutation.config.ts`.

| Layer                | Target                                              |
| -------------------- | --------------------------------------------------- |
| `src/lib/` utilities | ≥ 80% line coverage                                 |
| API route handlers   | All happy-path + primary error branches             |
| React components     | Key render states and user interactions             |
| E2E                  | Critical journey: load → connect → submit → success |

```bash
# Generate a coverage report
npx vitest run --config vitest.mutation.config.ts --coverage
# Open coverage/index.html in a browser for the full report
```

Coverage output is written to `./coverage/` (git-ignored). Hard thresholds are not currently enforced in CI but are planned. Track regressions by comparing the `coverage/coverage-summary.json` between branches.

---

## Fixtures & Mock Conventions

All shared test helpers, factories, and fixtures live in `src/test/`:

```
src/test/
├── setup.ts               — Vitest setup file (loads @testing-library/jest-dom)
├── test-helpers.ts        — Factory functions for test data
├── mocks/
│   ├── handlers.ts        — MSW request handlers for API mocking
│   └── server.ts          — MSW server setup (start/stop/reset)
└── *.test.ts / *.test.tsx — Unit and component tests
```

### Factory functions (`src/test/test-helpers.ts`)

Use factory functions instead of copy-pasting object literals. Factories produce valid objects with sensible defaults and accept partial overrides:

```ts
import { createTestTransaction, createQuoteFactory } from '@/test/test-helpers';

// Default transaction
const tx = createTestTransaction();

// Override specific fields
const failedTx = createTestTransaction({ status: 'failed', amount: '50' });

// Quote factory
const quote = createQuoteFactory.withAmount('100').withCurrency('NGN').create();
```

Available factories:

- `createTestTransaction(overrides?)` — `Transaction` with status, amount, currency
- `createValidStellarAddress()` — valid `G…` address string
- `createValidBaseAddress()` — valid `0x…` EVM address string
- `createQuoteFactory` — fluent builder for `QuoteResponse`
- `createBeneficiaryFactory` — fluent builder for `Beneficiary`
- `createApiResponseFactory` — success / error / notFound / unauthorized helpers
- `createUserDataFactory` — wallet address + mock user data
- `createLocalStorageMock()` — localStorage stub for environments without jsdom

### MSW handlers (`src/test/mocks/`)

Use [MSW (Mock Service Worker)](https://mswjs.io/) to intercept real HTTP requests in integration tests. Handlers are defined in `src/test/mocks/handlers.ts`:

```ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('https://api.paycrest.io/v1/orders', () =>
    HttpResponse.json({ id: 'mock-order-id', status: 'pending' }),
  ),
];
```

Start/reset/stop the MSW server in test lifecycle hooks:

```ts
import { server } from '@/test/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Override a handler for a single test:

```ts
server.use(
  http.post('https://api.paycrest.io/v1/orders', () =>
    HttpResponse.json({ error: 'Insufficient liquidity' }, { status: 422 }),
  ),
);
```

### When to use `vi.mock` vs MSW

| Scenario                                         | Use                                           |
| ------------------------------------------------ | --------------------------------------------- |
| Mocking a TypeScript module (SDK, adapter class) | `vi.mock('@/lib/clients/paycrest')`           |
| Mocking an external HTTP endpoint                | MSW handler                                   |
| Mocking `localStorage` or browser APIs           | `createLocalStorageMock()` or `vi.stubGlobal` |
| Mocking environment variables                    | `vi.mock('@/lib/env', ...)`                   |

### Shared fixtures for localStorage

Tests that use `localStorage` must clear it in `beforeEach` to prevent cross-test pollution:

```ts
beforeEach(() => localStorage.clear());
```

Do not rely on `localStorage` state left by a previous test.

---

## Mocking External Services

### Environment variables

Always mock `@/lib/env` rather than setting `process.env` directly:

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

### Allbridge SDK

```ts
vi.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: class {
    chainDetailsMap = vi.fn().mockResolvedValue({ STELLAR: {}, BASE: {} });
    buildSwapAndBridgeTx = vi.fn().mockResolvedValue({ tx: 'fake-xdr' });
  },
  nodeRpcUrlsDefault: {},
}));
```

### Stellar SDK

```ts
vi.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: class {
      loadAccount = vi.fn().mockResolvedValue({ balances: [] });
    },
  },
  Networks: { PUBLIC: 'Public Global Stellar Network ; September 2015' },
}));
```

### Rate limiter

```ts
vi.mock('@/lib/offramp/utils/rate-limiter', () => ({
  buildTxLimiter: { check: () => ({ allowed: true }) },
  paycrestOrderLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => '127.0.0.1',
}));
```

### Database (`pg` pool)

```ts
vi.mock('@/lib/db/client', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  },
}));
```

### React component callbacks

```ts
const onSubmit = vi.fn();
render(<FormCard {...baseProps} onSubmit={onSubmit} />);
await userEvent.click(screen.getByRole('button', { name: /submit/i }));
expect(onSubmit).toHaveBeenCalledOnce();
```

### `localStorage`

`jsdom` provides a real `localStorage`. Clear it in `beforeEach` to avoid cross-test pollution:

```ts
beforeEach(() => localStorage.clear());
```

---

## How to Write a Good Test

### 1. Name tests as specifications, not implementations

Bad:

```ts
it('works', () => { ... });
it('test validateAmount', () => { ... });
```

Good:

```ts
it('returns false for an amount below the minimum (0.70 USDC)', () => { ... });
it('returns true for a valid positive decimal amount', () => { ... });
```

The test name should read as a sentence that explains the expected behavior. A failing test name alone should tell you what broke.

### 2. Arrange → Act → Assert (AAA)

Structure every test in three clear sections:

```ts
it('deducts the bridge fee from the USDC amount', () => {
  // Arrange
  const amount = '100';
  const bridgeFeeRate = 0.004;

  // Act
  const result = calculateBridgeFee(amount, bridgeFeeRate);

  // Assert
  expect(result).toBe('0.40');
});
```

### 3. Test one thing per test

Each test should have one reason to fail. If a test asserts three unrelated behaviors, split it into three tests. Multiple `expect` calls on the same unit are fine; testing multiple independent concerns in one test is not.

### 4. Cover the important cases

Every non-trivial function needs at minimum:

- **Happy path**: valid inputs produce the expected output
- **Boundary values**: minimum, maximum, zero, empty
- **Error paths**: invalid inputs throw or return the correct error
- **Edge cases**: nullish values, empty arrays, maximum length strings

```ts
describe('validateAmount', () => {
  it('accepts the minimum valid amount (0.70)', () => { ... });
  it('accepts a large valid amount', () => { ... });
  it('rejects an empty string', () => { ... });
  it('rejects a negative number', () => { ... });
  it('rejects a non-numeric string', () => { ... });
  it('rejects zero', () => { ... });
});
```

### 5. Assert specific values, not just truthiness

Bad:

```ts
expect(result).toBeTruthy();
expect(fees).not.toBeNull();
```

Good:

```ts
expect(result).toBe(true);
expect(fees.bridgeFee).toBe('0.40');
```

Specific assertions catch mutations; truthiness assertions do not.

### 6. Do not test implementation details

Tests should verify _what_ the code does, not _how_ it does it internally. Avoid:

- Asserting that a private function was called
- Checking internal state that is not surfaced through the public interface
- Reaching into component internals instead of querying by accessible role/label

Good component test queries (via React Testing Library):

```ts
// ✅ Query by accessible role
screen.getByRole('button', { name: /send/i });

// ✅ Query by label text
screen.getByLabelText(/account number/i);

// ✅ Query by visible text
screen.getByText(/transaction complete/i);

// ❌ Query by CSS class or test-id where ARIA is available
screen.getByTestId('submit-btn');
```

### 7. Keep tests fast and isolated

- Unit tests must not make real network requests
- Always mock `@/lib/env` instead of setting `process.env` directly
- Clear `localStorage`, mocks, and timers in `beforeEach` / `afterEach`
- Use `vi.useFakeTimers()` for time-dependent logic

### 8. Test error paths explicitly

```ts
it('returns 400 when amount is missing from the request body', async () => {
  const req = new NextRequest('http://localhost/api/offramp/quote', {
    method: 'POST',
    body: JSON.stringify({ currency: 'NGN' }), // no amount
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.message).toMatch(/amount/i);
});
```

Do not assume the happy path is the only path worth testing. Route handlers and service functions have multiple failure modes; each should have a test.

### 9. Avoid snapshot tests for logic

Snapshot tests are appropriate for stable UI output (receipt formatting, static markup). Do not use snapshots to test business logic — they hide regressions behind "update snapshots" prompts.

### 10. Keep test files next to the code they test

| Code location                        | Test location                                        |
| ------------------------------------ | ---------------------------------------------------- |
| `src/lib/fee-calculation.ts`         | `src/test/fee-calculation.test.ts`                   |
| `src/components/Header.tsx`          | `src/test/Header.test.tsx`                           |
| `src/app/api/offramp/quote/route.ts` | `src/test/integration/api-quote.integration.test.ts` |
| `contracts/escrow/src/lib.rs`        | `contracts/escrow/tests/integration.rs`              |

---

## CI/CD Testing Pipeline

Tests run automatically on every push and pull request via GitHub Actions.

### Pipeline stages

```
Push / PR
    │
    ▼
┌─────────────────────────────────────────┐
│  1. Install          npm ci             │
│  2. Lint             npm run lint       │
│  3. Type check       npx tsc --noEmit   │
│  4. Unit tests       npm test           │
│  5. Build            npm run build      │
│  6. E2E tests        npm run test:e2e   │
│  7. Deploy (main)    vercel --prod      │  ← only on main
└─────────────────────────────────────────┘
```

### Failure behaviour

- **Lint or type-check failure** → pipeline stops; no tests run.
- **Unit test failure** → pipeline stops; no build or E2E.
- **Build failure** → E2E and deploy are skipped.
- **E2E failure** → deploy is blocked.

### Playwright in CI

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
```

In CI (`CI=true`), Playwright:

- Uses 1 worker (sequential execution)
- Retries each test up to 2 times before marking it failed
- Forbids `.only` (via `forbidOnly: true`) to prevent accidental test isolation

### Artifacts

| Artifact               | Trigger        | Location             |
| ---------------------- | -------------- | -------------------- |
| Playwright HTML report | Always         | `playwright-report/` |
| Playwright traces      | On first retry | `test-results/`      |
| Coverage report        | Manual run     | `coverage/`          |

Upload reports in CI:

```yaml
- name: Upload Playwright report
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7
```

### Branch protection requirements

The `main` branch requires all of the following to pass before merging:

1. `Lint`
2. `Type check`
3. `Unit tests`
4. `Build`
5. `E2E tests`

Configure these as required status checks in GitHub → Settings → Branches → Branch protection rules.
