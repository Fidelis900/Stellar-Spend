# Contributing to Stellar-Spend

Thanks for your interest in contributing. This guide covers everything you need to get oriented, write code that fits the project, and get your changes merged.

---

## Table of Contents

1. [Project Architecture](#project-architecture)
2. [Project Structure](#project-structure)
3. [Local Setup](#local-setup)
4. [Coding Standards](#coding-standards)
5. [Testing Requirements](#testing-requirements)
6. [Git Workflow & PR Guidelines](#git-workflow--pr-guidelines)
7. [Troubleshooting](#troubleshooting)

---

## Project Architecture

Stellar-Spend is a **Next.js 15 App Router** application. There is no separate backend — all server logic lives in Next.js API route handlers under `src/app/api/`.

The off-ramp flow has three stages:

```
Stellar wallet  →  Allbridge bridge  →  Base chain  →  Paycrest payout  →  Bank account
     (XDR)           (Soroban tx)        (USDC)          (fiat order)
```

Key architectural decisions:

- **No database.** Transaction history is stored in browser `localStorage` (key: `stellar_spend_transactions`, max 50 records).
- **Secrets stay server-side.** `PAYCREST_API_KEY` and `BASE_PRIVATE_KEY` are validated at startup and must never use the `NEXT_PUBLIC_` prefix. The app throws a clear error if they are misconfigured.
- **Allbridge SDK is dynamically imported** in API routes to avoid bundling it into the client.
- **Adapters pattern.** External services (Allbridge, Paycrest, Soroban) are wrapped in adapter classes under `src/lib/offramp/adapters/` so they can be mocked in tests.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── health/               # GET /api/health
│   │   ├── offramp/
│   │   │   ├── bridge/           # build-tx, submit-soroban, tx-status, status, gas-fee-options
│   │   │   ├── currencies/       # GET supported fiat currencies
│   │   │   ├── institutions/     # GET banks by currency
│   │   │   ├── paycrest/order/   # POST create order, GET order status
│   │   │   ├── quote/            # POST get FX quote
│   │   │   ├── status/           # GET payout order status (legacy)
│   │   │   └── verify-account/   # POST verify bank account
│   │   └── webhooks/paycrest/    # POST Paycrest event webhook
│   ├── history/                  # Transaction history page
│   └── page.tsx                  # Main off-ramp UI
├── components/
│   ├── ui/                       # Primitive UI components (InputField, SelectField, etc.)
│   ├── FormCard.tsx              # Main form (amount, beneficiary, fee method)
│   ├── StellarSpendDashboard.tsx # Top-level page orchestrator
│   └── TransactionProgressModal.tsx  # Step-by-step progress overlay
├── hooks/                        # React hooks (wallet, polling, theme)
├── lib/
│   ├── env.ts                    # Env validation — throws at startup if misconfigured
│   ├── error-handler.ts          # Centralised NextResponse error helpers
│   ├── transaction-storage.ts    # localStorage read/write
│   ├── stellar/wallet-adapter.ts # Freighter + Lobstr wallet abstraction
│   └── offramp/
│       ├── adapters/             # Allbridge, Paycrest, Soroban adapters
│       ├── types/                # Shared TypeScript types (TradeState, BridgeStatus, etc.)
│       └── utils/                # validation, polling, timeout, rate-limiter, logger
├── contexts/                     # React contexts (ToastContext)
├── types/                        # Global type declarations
└── test/                         # Unit/integration tests + test helpers
```

---

## Local Setup

### Prerequisites

- Node.js 18 or 20 (matches CI matrix)
- npm

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local

# 3. Fill in .env.local — see inline comments in .env.example
#    Required server vars: PAYCREST_API_KEY, PAYCREST_WEBHOOK_SECRET,
#                          BASE_PRIVATE_KEY, BASE_RETURN_ADDRESS, BASE_RPC_URL,
#                          STELLAR_SOROBAN_RPC_URL, STELLAR_HORIZON_URL
#    Required public vars: NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL,
#                          NEXT_PUBLIC_BASE_RETURN_ADDRESS,
#                          NEXT_PUBLIC_STELLAR_USDC_ISSUER

# 4. Start the dev server
npm run dev
# → http://localhost:3001
```

The app validates all required env vars at startup and throws a descriptive error if any are missing or if a secret is accidentally exposed via `NEXT_PUBLIC_`.

---

## Coding Standards

### Language & Tooling

- **TypeScript** everywhere — no `any` unless wrapping an untyped third-party SDK (add a comment explaining why).
- **ESLint** with zero warnings: `npm run lint`. CI fails on any warning.
- **Tailwind CSS v4** for styling. No inline `style` props unless unavoidable.
- Use the `cn()` helper from `src/lib/cn.ts` for conditional class merging.

### File Conventions

- API route files are named `route.ts` and export named HTTP method functions (`GET`, `POST`).
- One component per file. File name matches the exported component name.
- Co-locate tests with the code they test when it's a unit test for a single module (e.g., `validation.test.ts` next to `validation.ts`). Integration/component tests go in `src/test/`.

### Error Handling

- API routes return errors via `NextResponse.json({ error: "..." }, { status: N })`.
- Use `ErrorHandler` from `src/lib/error-handler.ts` for standard error shapes.
- Never swallow errors silently — log with `console.error` before returning a response.
- Distinguish upstream failures (502) from client mistakes (400) from server bugs (500).

### Environment Variables

- Server-only secrets: no `NEXT_PUBLIC_` prefix. Ever.
- Access env vars through the validated `env` object from `src/lib/env.ts`, not directly via `process.env`.
- If you add a new required env var, add it to `requiredServerEnvKeys` or `requiredPublicEnvKeys` in `env.ts` and to `.env.example` with an inline comment.

### Rate Limiting & Logging

- Endpoints that trigger expensive external calls (Allbridge SDK, Paycrest order creation) use the rate limiter from `src/lib/offramp/utils/rate-limiter.ts`.
- Use `generateRequestId` + `createRequestLogger` for structured logging in rate-limited routes. Include `X-Request-Id` in responses.

---

## Testing Requirements

### Running Tests

```bash
npm test              # run all unit tests once (Vitest)
npm run test:watch    # watch mode
npm run test:e2e      # Playwright end-to-end (requires dev server)
```

### Test Framework

- **Unit/integration**: [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) + jsdom
- **E2E**: [Playwright](https://playwright.dev/) targeting `http://localhost:3001`
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`)

### What to Test

| Change type          | Required tests                                        |
| -------------------- | ----------------------------------------------------- |
| New API route        | Unit test for validation, happy path, and error cases |
| New utility function | Unit test covering edge cases                         |
| New React component  | Render test + key interaction test                    |
| Bug fix              | Regression test that fails before the fix             |

### Test Helpers

`src/test/test-helpers.ts` provides:

- `createTestTransaction(overrides?)` — factory for `Transaction` objects
- `createValidStellarAddress()` — generates a valid G-key format address
- `createValidBaseAddress()` — generates a valid 0x address
- `createLocalStorageMock()` — in-memory localStorage substitute

Use these instead of hardcoding test data.

### Mocking External Services

Adapters in `src/lib/offramp/adapters/` are the seam for mocking. Mock the adapter class, not the underlying `fetch` calls, unless you are specifically testing the adapter itself.

### CI Requirements

CI runs on Node 18 and 20. A PR cannot merge if:

- `npm run lint` exits non-zero
- `npm run build` fails
- `npm test` has any failing test
- The `.next` build output exceeds 150 MB

---

## Git Workflow & PR Guidelines

### Branching

```
main          ← protected, always deployable
feat/<topic>  ← new features
fix/<topic>   ← bug fixes
docs/<topic>  ← documentation only
chore/<topic> ← tooling, deps, config
```

Branch off `main`. Keep branches focused on a single concern.

### Commits

Write commits in the imperative mood, present tense:

```
# Good
feat: add gas fee options endpoint
fix: handle 404 from Allbridge status poll
docs: add API documentation

# Avoid
Added gas fee options
Fixed a bug
```

Reference the issue number when relevant: `fix: handle empty currency list (#42)`.

### Pull Requests

1. **Push to a new branch** — never directly to `main`.
2. Open a PR against `main`.
3. Keep the title under 70 characters.
4. PR description should cover:
   - What changed and why
   - How it was tested
   - Any follow-up work or known limitations
5. All CI checks must pass before merging.
6. At least one review approval is required.

### Before Opening a PR

```bash
npm run lint    # zero warnings
npm test        # all tests pass
npm run build   # clean build
```

---

## Troubleshooting

### App fails to start with env error

```
Error: Invalid environment configuration for Stellar-Spend.
Missing required server env vars: PAYCREST_API_KEY, ...
```

You have missing or placeholder values in `.env.local`. Copy `.env.example` and fill in real values. The error message lists exactly which keys are missing.

### `NEXT_PUBLIC_` secret exposure error

```
Remove secret values from public env vars: NEXT_PUBLIC_PAYCREST_API_KEY
```

You have set a secret with the `NEXT_PUBLIC_` prefix. Rename it to remove the prefix and access it only in server-side code.

### Allbridge SDK errors in tests

The Allbridge SDK is dynamically imported and makes real network calls. Tests that exercise routes using the SDK should mock the `@allbridge/bridge-core-sdk` module or the `AllbridgeAdapter` class directly.

### `Bridge quote unavailable` / `FX rate unavailable` in development

These 502 errors mean the Allbridge or Paycrest upstream is unreachable. Check:

- `BASE_RPC_URL` and `STELLAR_SOROBAN_RPC_URL` are valid and reachable
- Your network allows outbound HTTPS to `api.paycrest.io`
- Allbridge SDK `nodeRpcUrlsDefault` endpoints are up

### Vitest can't find `@/` imports

The `@` alias is configured in `vitest.config.ts` to resolve to `src/`. If you see module-not-found errors, confirm you haven't moved files outside `src/` and that the import path starts with `@/`.

### Playwright tests fail locally

E2E tests expect the dev server at `http://localhost:3001`. Run `npm run dev` in a separate terminal before `npm run test:e2e`, or let Playwright start it automatically (it will if no server is already listening).

### Bundle size CI check fails

Run `npm run build:analyze` to open the interactive treemap and identify what grew. The limit is 150 MB for the `.next` output directory. Large expected dependencies are `@stellar/stellar-sdk`, `@allbridge/bridge-core-sdk`, and `viem`.
