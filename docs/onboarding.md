# Developer Onboarding Guide

Welcome to Stellar-Spend! This guide gets you from zero to a running local environment
and explains everything you need to contribute effectively.

---

## Table of Contents

1. [First 30 Minutes — Quick Start](#first-30-minutes--quick-start)
2. [Project Overview](#project-overview)
3. [Architecture Overview](#architecture-overview)
4. [Key Files and Their Purposes](#key-files-and-their-purposes)
5. [Common Development Workflows](#common-development-workflows)
6. [Testing Strategy and Running Tests](#testing-strategy-and-running-tests)
7. [Testing with Stellar Testnet](#testing-with-stellar-testnet)
8. [Debugging Techniques](#debugging-techniques)
9. [Troubleshooting Common Setup Issues](#troubleshooting-common-setup-issues)
10. [First Good Issue Walkthrough](#first-good-issue-walkthrough)
11. [Glossary of Stellar / Blockchain Terms](#glossary-of-stellarblockchain-terms)

---

## First 30 Minutes — Quick Start

### Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| npm | 10.x | bundled with Node.js |
| PostgreSQL | 14+ | [postgresql.org](https://postgresql.org) or Docker |
| Git | any | [git-scm.com](https://git-scm.com) |

### Step 1 — Clone and install

```bash
git clone https://github.com/Lex-Studios/Stellar-Spend.git
cd Stellar-Spend
npm install
```

### Step 2 — Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values. The minimum set to run locally:

| Variable | Where to get it |
|---|---|
| `PAYCREST_API_KEY` | [Paycrest dashboard](https://paycrest.io) → API credentials |
| `PAYCREST_WEBHOOK_SECRET` | Paycrest dashboard → Webhook settings |
| `BASE_PRIVATE_KEY` | Your Base wallet private key (use a dev wallet — never a production key) |
| `BASE_RETURN_ADDRESS` | Public address matching your `BASE_PRIVATE_KEY` |
| `BASE_RPC_URL` | `https://mainnet.base.org` or your RPC provider URL |
| `STELLAR_SOROBAN_RPC_URL` | `https://soroban-rpc.mainnet.stellar.gateway.fm` |
| `STELLAR_HORIZON_URL` | `https://horizon.stellar.org` |
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/stellar_spend` |
| `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | Same as `STELLAR_SOROBAN_RPC_URL` |
| `NEXT_PUBLIC_BASE_RETURN_ADDRESS` | Same as `BASE_RETURN_ADDRESS` |
| `NEXT_PUBLIC_STELLAR_USDC_ISSUER` | Circle's Stellar USDC issuer (see [Stellar USDC docs](https://www.circle.com/en/usdc-multichain/stellar)) |

> **Security:** Variables prefixed `NEXT_PUBLIC_` are bundled into the browser.  
> Never add `PAYCREST_API_KEY` or `BASE_PRIVATE_KEY` with the `NEXT_PUBLIC_` prefix.
> The app validates this at startup — see [`src/lib/env.ts`](../src/lib/env.ts).

### Step 3 — Set up the database

```bash
# Create the database
createdb stellar_spend

# Run migrations in order
psql stellar_spend < migrations/001_create_transactions.sql
psql stellar_spend < migrations/002_add_transaction_analytics_fields.sql
psql stellar_spend < migrations/003_create_idempotency_keys.sql
psql stellar_spend < migrations/004_create_transaction_notifications.sql
psql stellar_spend < migrations/005_create_api_keys.sql
# ... continue for all migration files in numeric order
```

Or with Docker:

```bash
docker compose up -d postgres
npm run db:migrate  # if a migrate script is configured
```

### Step 4 — Start the dev server

```bash
npm run dev
```

The app starts at **http://localhost:3001**.  
Interactive API docs are available at **http://localhost:3001/api/docs**.

### Step 5 — Verify the setup

```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok","timestamp":"...","version":"1.0.0"}
```

If you see `"status":"ok"` you're ready to code. 🎉

---

## Project Overview

Stellar-Spend is a **Next.js 15 App Router** application that lets users convert Stellar
USDC to local fiat currency (e.g., Nigerian Naira) and receive the funds in a bank account.

### The off-ramp flow (high level)

```
User's Stellar wallet (USDC)
  │
  ▼
Allbridge bridge (Stellar → Base chain USDC)
  │
  ▼
Paycrest settlement (Base USDC → fiat bank transfer)
  │
  ▼
Beneficiary's bank account
```

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| Styling | Tailwind CSS v4 |
| Bridge | `@allbridge/bridge-core-sdk` |
| Stellar wallet | `@stellar/freighter-api`, `@stellar/stellar-sdk` |
| EVM (Base) | `viem` |
| Database | PostgreSQL (`pg`) |
| Testing | Vitest, React Testing Library, Playwright |
| Error tracking | Sentry |
| Deployment | Vercel / Docker / Kubernetes |

---

## Architecture Overview

### System diagram

```mermaid
graph LR
    A([User / Browser]) -->|Signs XDR| B[Stellar Network]
    B -->|Bridge deposit| C[Allbridge Protocol]
    C -->|USDC on Base| D[Base Chain]
    D -->|Server sends USDC| E[Paycrest API]
    E -->|Fiat settlement| F([Beneficiary Bank])

    subgraph "Stellar-Spend Server (Next.js 15)"
        G[App Router Pages]
        H[API Routes]
        I[Middleware Layer]
        G --> H
        I --> H
    end

    A -->|Quote / Build TX| H
    B -->|TX hash| H
    H --> D
    H --> E
```

### Layer responsibilities

| Layer | Path | Responsibility |
|-------|------|---------------|
| **Pages** | `src/app/*.tsx` | React Server / Client Components, UI rendering |
| **API routes** | `src/app/api/` | HTTP handlers — validate input, call services, return responses |
| **Middleware** | `middleware.ts` | Edge: CORS, versioning, rate limiting, deprecation headers |
| **Services** | `src/lib/services/` | Business logic orchestrating multiple adapters |
| **Adapters** | `src/lib/offramp/adapters/`, `src/lib/clients/` | External service wrappers (Allbridge SDK, Paycrest REST, viem) |
| **Repository** | `src/lib/repositories/`, `src/lib/db/` | Database access layer (PostgreSQL via `pg`) |
| **Contracts** | `contracts/` | Soroban smart contracts (Rust) — escrow, treasury, fee manager |

### Service/repository/middleware architecture

```
HTTP Request
    │
    ▼
middleware.ts (Edge)
  ├── CORS check
  ├── API versioning header injection
  └── Rate limit check (sliding window)
    │
    ▼
src/app/api/<route>/route.ts
  ├── Input validation (Zod schemas in src/lib/validators/)
  ├── Idempotency check (src/lib/idempotency.ts)
  ├── API key auth (src/lib/api-keys/auth.ts)  ← v1 routes only
  └── Business logic via service/adapter
    │
    ▼
src/lib/services/<service>.ts
  └── Coordinates adapters and repositories
    │
    ├── src/lib/clients/allbridge.ts  → Allbridge SDK
    ├── src/lib/clients/paycrest.ts   → Paycrest REST API
    ├── src/lib/clients/base.ts       → Base chain via viem
    └── src/lib/db/dal.ts             → PostgreSQL
```

### Soroban contract interactions

The bridge flow invokes a Soroban contract on Stellar:

1. `build-tx` route calls `buildSwapAndBridgeTx()` in `src/lib/offramp/adapters/soroban-tx-builder.ts` — produces an unsigned XDR.
2. The user's wallet (Freighter / Lobstr) signs the XDR client-side.
3. `submit-soroban` submits the signed XDR to the Soroban RPC.
4. Allbridge detects the deposit and releases USDC on Base.

Smart contracts in `contracts/` are deployed separately — see `docs/stellar-soroban-handbook.md` for details.

### Data flow: quote → bridge → payout → refund

| Phase | Key files | Description |
|-------|-----------|-------------|
| **Quote** | `src/app/api/offramp/quote/route.ts`, `src/lib/offramp/utils/quote-fetcher.ts` | Fetch FX rate from Paycrest; calculate bridge fee |
| **Bridge** | `src/app/api/offramp/bridge/build-tx/route.ts`, `src/lib/offramp/adapters/soroban-tx-builder.ts` | Build Soroban XDR; user signs; submit to network |
| **Payout** | `src/app/api/offramp/paycrest/order/route.ts`, `src/lib/offramp/adapters/paycrest-adapter.ts` | Create Paycrest order; server sends USDC on Base |
| **Status** | `src/app/api/offramp/bridge/status/[txHash]/route.ts`, `src/app/api/offramp/status/[orderId]/route.ts` | Poll Allbridge and Paycrest status |
| **Webhook** | `src/app/api/webhooks/paycrest/route.ts`, `src/lib/services/webhook.service.ts` | Receive settled/refunded events; update transaction record |
| **Refund** | `src/app/api/offramp/refund/route.ts`, `src/lib/refund/refund-service.ts` | Process eligible refunds back to the user's wallet |

---

## Key Files and Their Purposes

### Configuration & Environment

| File | Purpose |
|---|---|
| `.env.example` | Template for all environment variables with documentation |
| `src/lib/env.ts` | Validates all required env vars at startup; exports typed `env` object |
| `next.config.ts` | Next.js configuration (headers, rewrites, bundle analyzer) |
| `middleware.ts` | Edge middleware for CORS, rate limiting on all routes |

### API Routes

All API routes live under `src/app/api/`. Routes follow Next.js App Router conventions
— each `route.ts` file exports HTTP method handlers (`GET`, `POST`, etc.).

| Path | Purpose |
|---|---|
| `src/app/api/health/` | Health check |
| `src/app/api/offramp/` | Core off-ramp endpoints (currencies, quote, bridge, Paycrest) |
| `src/app/api/v1/` | Versioned API (mirrors `/api/offramp/*` with API key auth) |
| `src/app/api/webhooks/` | Inbound Paycrest payment event webhooks |
| `src/app/api/api-keys/` | Admin API key management |
| `src/app/api/auth/2fa/` | Two-factor authentication |
| `src/app/api/transactions/` | Transaction history CRUD |
| `src/app/api/docs/` | Swagger UI (served from `/api/docs`) |

### Core Library

| File / Directory | Purpose |
|---|---|
| `src/lib/clients/allbridge.ts` | Allbridge SDK adapter — lazy singleton, 5-min cache |
| `src/lib/clients/paycrest.ts` | Paycrest REST adapter — typed error class (`PaycrestHttpError`) |
| `src/lib/clients/base.ts` | Base/EVM client (`viem`) for USDC transfers |
| `src/lib/api-versioning/` | Version negotiation (URL prefix, X-API-Version header, Accept header) |
| `src/lib/api-keys/` | API key creation, authentication, rotation, revocation |
| `src/lib/beneficiary-storage.ts` | localStorage-backed beneficiary store with AES-256 encryption |
| `src/lib/error-handler.ts` | Unified HTTP error response factory |
| `src/lib/db/client.ts` | PostgreSQL connection pool |
| `src/lib/db/dal.ts` | Data access layer for transactions and notifications |
| `src/lib/idempotency.ts` | Idempotency key lookup, lock, and store logic |
| `src/lib/two-fa.ts` | TOTP generation, URI building, and verification |

### Migrations

SQL migrations in `migrations/` are numbered sequentially. Always run them in order.  
Check the migration files for the schema that underpins each feature.

### Documentation

| File | Purpose |
|---|---|
| `openapi.yaml` | OpenAPI 3.0 spec for all endpoints |
| `docs/api.md` | Human-readable API reference |
| `docs/adr/` | Architecture Decision Records — why things are the way they are |
| `docs/diagrams/` | Mermaid sequence diagrams for all major flows |
| `docs/allbridge-integration.md` | Allbridge bridge setup and troubleshooting |
| `docs/paycrest-integration.md` | Paycrest order lifecycle and webhook handling |
| `docs/api-migration-v1.md` | Migration guide from legacy to versioned routes |
| `TESTING.md` | Comprehensive testing guide |

---

## Common Development Workflows

### Adding a new API endpoint

1. Create `src/app/api/<path>/route.ts` and export `GET`/`POST`/etc. handlers.
2. Add the endpoint to `openapi.yaml` under `paths:`.
3. Write a test in `src/test/<name>.test.ts`.
4. If it needs a DB table, create a migration in `migrations/NNN_description.sql`.
5. If it calls an external service, add a method to the relevant adapter in `src/lib/clients/`.

### Running the app locally with hot reload

```bash
npm run dev
# → http://localhost:3001
```

### Linting

```bash
npm run lint
# Uses ESLint 9 with Next.js, TypeScript, and React rules.
# Zero warnings are allowed (--max-warnings 0).
```

### Building for production

```bash
npm run build
npm start
```

### Validating the OpenAPI spec

```bash
npx @apidevtools/swagger-cli validate openapi.yaml
```

### Working with database migrations

```bash
# Apply a new migration manually
psql $DATABASE_URL < migrations/NNN_my_change.sql

# Inspect the schema
psql $DATABASE_URL -c "\d+ transactions"
```

### Using Docker Compose for dependencies only

```bash
# Start only postgres (don't containerize the app during development)
docker compose up -d postgres

# Check logs
docker compose logs -f postgres
```

---

## Testing Strategy and Running Tests

Stellar-Spend has three test layers. See [`TESTING.md`](../TESTING.md) for the full guide.

### Unit tests (Vitest)

Fast, isolated tests for utilities and API route handlers. All external services (Allbridge SDK,
Paycrest API, DB, `env`) are mocked.

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Key patterns:
- Always mock `@/lib/env` instead of setting `process.env` directly.
- Mock `@allbridge/bridge-core-sdk` at the top of any test that touches bridge logic.
- Clear `localStorage` in `beforeEach` for tests involving `BeneficiaryStorage`.

### Coverage

```bash
npx vitest run --coverage
# Output: ./coverage/
```

Target: ≥ 80% line coverage for `src/lib/` utilities; all happy-path + error branches for API routes.

### E2E tests (Playwright)

Run against a real dev server on `localhost:3001`.

```bash
npm run test:e2e

# Open the HTML report
npx playwright show-report
```

Wallet extensions (Freighter, Lobstr) cannot be installed in Playwright's Chromium. Stub
`window.freighter` / `window.lobstr` via `page.addInitScript` for wallet-dependent flows.

### Testing individual route handlers

```ts
// Import the handler directly — no HTTP server needed
import { POST } from '@/app/api/offramp/quote/route';
import { NextRequest } from 'next/server';

const req = new NextRequest('http://localhost/api/offramp/quote', {
  method: 'POST',
  body: JSON.stringify({ amount: '100', currency: 'NGN', feeMethod: 'USDC' }),
});
const res = await POST(req);
expect(res.status).toBe(200);
```

---

## Testing with Stellar Testnet

### Obtaining testnet XLM

Use Stellar's Friendbot to fund a testnet account:

```bash
curl "https://friendbot.stellar.org?addr=<YOUR_G_ADDRESS>"
```

Or use the [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test).

### Adding testnet USDC trustline

On testnet, USDC is issued by a different account than mainnet. Add the trustline using Stellar Laboratory:
1. Go to Transaction Builder → Add Operation → Change Trust
2. Asset code: `USDC`
3. Asset issuer: the testnet USDC issuer (check [Stellar testnet docs](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets))

### Pointing the app at testnet

Update `.env.local`:

```env
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.testnet.stellar.gateway.fm
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.testnet.stellar.gateway.fm
NEXT_PUBLIC_STELLAR_USDC_ISSUER=<testnet USDC issuer address>
```

### Paycrest sandbox

Obtain a Paycrest sandbox API key from the [Paycrest dashboard](https://paycrest.io).  
The `PaycrestAdapter` uses the same base URL (`https://api.paycrest.io/v1`) for both
sandbox and production — the key determines the environment.

```env
PAYCREST_API_KEY=sandbox_your_key_here
```

### Allbridge testnet

Allbridge's testnet is configured via the SDK's chain details. Point the RPC URLs to testnet endpoints
and the SDK will use the appropriate testnet bridge contracts.

> **Note:** The Allbridge bridge may not be available on Stellar testnet. For bridge testing, you may
> need to mock the bridge routes and only test the Paycrest settlement flow end-to-end.

---

## Debugging Techniques

### Server-side logs

Next.js prints all `console.log` / `console.error` from API routes to the terminal running `npm run dev`.
Key log patterns to look for:

| Log prefix | Meaning |
|---|---|
| `Diagnostic events:` | Soroban RPC rejected a transaction — decode the XDR for details |
| `PaycrestHttpError` | Paycrest API returned a non-2xx response — check `status` and `details` |
| `Invalid environment configuration` | Required env vars are missing — check `.env.local` |
| `Allbridge SDK error` | Bridge chain details fetch failed — check RPC URLs |

### Request tracing

Every API response includes an `X-Request-Id` header. Use it to correlate client errors with server logs:

```bash
curl -v http://localhost:3001/api/offramp/quote ...
# Look for: X-Request-Id: <uuid>
```

### Sentry (production)

Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` to enable Sentry error capture.
Source maps are uploaded during `npm run build` when `SENTRY_AUTH_TOKEN` is set.

### Inspecting the database

```bash
psql $DATABASE_URL

# Common queries
SELECT * FROM idempotency_keys ORDER BY created_at DESC LIMIT 10;
SELECT * FROM api_keys;
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5;
```

### Swagger UI

Visit **http://localhost:3001/api/docs** for an interactive API explorer that lets you call any
endpoint directly from the browser.

### Debugging Allbridge bridge issues

1. Check that `STELLAR_SOROBAN_RPC_URL` and `STELLAR_HORIZON_URL` are reachable.
2. Call `invalidateSdkCache()` (from `src/lib/clients/allbridge.ts`) to force SDK re-initialization.
3. Simulate the `build-tx` request manually via Swagger UI or curl.
4. Review the `Diagnostic events` in server logs for Soroban simulation failures.

### TypeScript errors

```bash
npx tsc --noEmit
```

This runs the TypeScript compiler without emitting files — useful for catching type errors across
the whole codebase without building.

---

## Troubleshooting Common Setup Issues

### `Invalid environment configuration` on startup

**Cause:** One or more required environment variables are missing from `.env.local`.  
**Fix:**
1. Run `diff .env.example .env.local` to see which variables are missing.
2. Fill in the missing values.
3. Restart the dev server.

### `Cannot connect to database` / `ECONNREFUSED`

**Cause:** PostgreSQL is not running or `DATABASE_URL` is wrong.  
**Fix:**
1. Check PostgreSQL is running: `pg_isready`
2. Verify the connection string: `psql $DATABASE_URL -c "SELECT 1"`
3. If using Docker: `docker compose up -d postgres`

### `NEXT_PUBLIC_PAYCREST_API_KEY detected` error

**Cause:** A secret was accidentally prefixed with `NEXT_PUBLIC_`.  
**Fix:** Remove the `NEXT_PUBLIC_` prefix from the variable in `.env.local` and restart.

### Port 3001 already in use

```bash
lsof -ti:3001 | xargs kill -9
npm run dev
```

### Allbridge `chainDetailsMap` timeout

**Cause:** The Soroban or Horizon RPC endpoint is slow or unreachable.  
**Fix:**
1. Test the RPC endpoint directly: `curl $STELLAR_SOROBAN_RPC_URL`
2. Try a different public RPC endpoint (see [Stellar documentation](https://developers.stellar.org/docs/data/apis/rpc/rpc-providers)).
3. The SDK cache auto-invalidates on error — the next request will retry.

### Build fails with `Cannot find module` for Allbridge SDK

**Cause:** ESM-only packages sometimes conflict with webpack in certain configurations.  
**Fix:** The SDK is imported dynamically (`await import(...)`) to avoid this. Check that
`src/lib/clients/allbridge.ts` is not being statically imported outside of server components.

### Vitest test fails with `validateEnv` error

**Cause:** `src/lib/env.ts` runs `validateEnv()` at module load time and fails when env vars
aren't set in the test environment.  
**Fix:** Mock `@/lib/env` in your test:

```ts
vi.mock('@/lib/env', () => ({
  env: {
    server: { PAYCREST_API_KEY: 'test', /* fill required keys */ },
    public: { NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL: 'https://test', /* ... */ },
  },
}));
```

---

---

## First Good Issue Walkthrough

This section walks through a concrete example: **adding a new supported fiat currency corridor** (e.g., GHS — Ghanaian Cedi). It touches all the key parts of the codebase.

### 1. Understand the change

Read the existing corridor config:

```bash
# See how corridors are configured
cat src/lib/corridor-config.ts | head -60
cat src/lib/currencies.ts | head -40
```

### 2. Add the corridor

In `src/lib/corridor-config.ts`, add an entry for the new currency following the existing pattern. In `src/lib/currencies.ts`, ensure the currency code is listed.

### 3. Write a unit test

```bash
# Add a test case alongside existing currency tests
vi src/lib/currencies.test.ts
```

Add a test asserting `isSupportedCurrency('GHS')` returns `true` and that `getCurrencyConfig('GHS')` returns the expected shape.

### 4. Run the tests

```bash
npm test -- --reporter=verbose
```

All existing tests must still pass.

### 5. Update the OpenAPI spec

In `openapi.yaml`, locate the `currency` enum examples under `QuoteRequest` and add `GHS`.

### 6. Validate the spec

```bash
npx @apidevtools/swagger-cli validate openapi.yaml
```

### 7. Run lint and type-check

```bash
npm run lint
npx tsc --noEmit
```

### 8. Open a PR

Follow the PR template in `.github/PULL_REQUEST_TEMPLATE.md`. Reference the issue number:

```
Closes #<issue-number>
```

The CI pipeline will automatically run lint, type-check, OpenAPI validation, unit tests, and build.

---

## Glossary of Stellar / Blockchain Terms

> A full, alphabetized glossary with all domain terms is available in **[docs/glossary.md](./glossary.md)**.

| Term | Definition |
|---|---|
| **Stellar** | A public blockchain network optimised for fast, low-cost payments and asset issuance |
| **Soroban** | Stellar's smart contract platform (EVM-compatible style contracts written in Rust) |
| **XDR** | External Data Representation — the binary serialisation format used by Stellar for transactions and ledger data |
| **Horizon** | Stellar's REST API server that indexes the ledger and provides account/transaction queries |
| **Soroban RPC** | JSON-RPC API for submitting and querying Soroban (smart contract) transactions |
| **USDC** | USD Coin — a fiat-backed stablecoin issued by Circle, available on Stellar and Base |
| **XLM** | The native asset of the Stellar network (lumens), used to pay transaction fees and maintain minimum account reserves |
| **Trustline** | A Stellar account's explicit consent to hold a specific asset (e.g., USDC). Must exist before USDC can be received |
| **Minimum reserve** | The minimum XLM balance a Stellar account must maintain (base reserve + per-entry reserve) |
| **G-address** | A Stellar account address starting with `G` — derived from an Ed25519 public key |
| **Base** | An Ethereum Layer 2 chain built by Coinbase on the OP Stack. USDC is native here |
| **EVM** | Ethereum Virtual Machine — the execution environment used by Ethereum and L2 chains like Base |
| **viem** | A TypeScript library for interacting with EVM chains (reading contracts, sending transactions) |
| **Allbridge** | A cross-chain bridge protocol that moves assets between blockchains (e.g., Stellar USDC → Base USDC) |
| **Paycrest** | A fiat settlement layer that accepts stablecoin deposits and disburses local currency to bank accounts |
| **Off-ramp** | Converting cryptocurrency to fiat currency — the opposite of an on-ramp |
| **On-ramp** | Converting fiat currency to cryptocurrency |
| **Idempotency** | A property of an operation where applying it multiple times produces the same result as applying it once |
| **HMAC** | Hash-based Message Authentication Code — used to verify that a message comes from a known sender and has not been tampered with |
| **XDR (signed)** | An XDR-encoded Stellar transaction that has been signed by the sender's private key and is ready for submission |
| **Freighter** | A Stellar browser extension wallet (similar to MetaMask for Ethereum) |
| **Lobstr** | Another popular Stellar wallet available as a browser extension and mobile app |
| **Soroban contract** | A smart contract deployed on Stellar's Soroban platform — Allbridge uses one for locking USDC before bridging |
| **ERC-20** | A standard interface for fungible tokens on EVM chains. USDC on Base is an ERC-20 token |
| **Gas fee** | The fee paid to network validators/miners to process a transaction. On Stellar, gas is paid in XLM or sometimes USDC via Allbridge |
| **ADR** | Architecture Decision Record — a document capturing an important architectural decision, its context, and consequences |
| **FX rate** | Foreign exchange rate — how many units of fiat currency one unit of USDC buys (e.g., 1 USDC = 1,550 NGN) |
| **Testnet** | A test blockchain network that uses worthless test tokens, allowing developers to test without real funds |
| **Mainnet** | The live production blockchain network where real assets are transacted |
