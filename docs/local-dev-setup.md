# Local Development Setup Guide

This guide provides an end-to-end walkthrough for setting up and running the complete **Stellar-Spend** stack locally — covering the **Rust smart contracts toolchain**, **Soroban CLI**, **PostgreSQL database**, and **Next.js frontend dev server**, along with common troubleshooting steps for Soroban and Stellar RPC errors.

---

## Table of Contents

1. [Prerequisites & System Requirements](#prerequisites--system-requirements)
2. [Step-by-Step Setup](#step-by-step-setup)
   - [Step 1: Clone Repository](#step-1-clone-repository)
   - [Step 2: Frontend & Node.js Dependencies](#step-2-frontend--nodejs-dependencies)
   - [Step 3: Rust & Soroban Toolchain Setup](#step-3-rust--soroban-toolchain-setup)
   - [Step 4: Database Setup (PostgreSQL)](#step-4-database-setup-postgresql)
   - [Step 5: Environment Variables Configuration](#step-5-environment-variables-configuration)
   - [Step 6: Build & Test Soroban Contracts](#step-6-build--test-soroban-contracts)
   - [Step 7: Start Next.js Development Server](#step-7-start-nextjs-development-server)
3. [Contract Development Workflow](#contract-development-workflow)
4. [Frontend & API Development Workflow](#frontend--api-development-workflow)
5. [Troubleshooting Guide](#troubleshooting-guide)
   - [Rust & Soroban Build Errors](#rust--soroban-build-errors)
   - [Stellar RPC & Horizon Errors](#stellar-rpc--horizon-errors)
   - [Wallet & Browser Extension Issues](#wallet--browser-extension-issues)
   - [Database & Environment Issues](#database--environment-issues)
6. [Clean Machine Verification Checklist](#clean-machine-verification-checklist)

---

## Prerequisites & System Requirements

Before beginning, ensure you have the following installed on your development machine:

| Component | Required Version | Purpose | Installation |
|-----------|------------------|---------|--------------|
| **Node.js** | `>= 20.x` (LTS recommended) | Next.js frontend & backend API routes | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| **npm** | `>= 10.x` | Node package manager | Bundled with Node.js |
| **Rust** | Stable toolchain (`>= 1.79.0`) | Compiling Soroban smart contracts | [rustup.rs](https://rustup.rs) (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`) |
| **wasm32 Target** | `wasm32-unknown-unknown` | Compiling Rust contracts to WebAssembly | `rustup target add wasm32-unknown-unknown` |
| **Stellar CLI** | `>= 21.0.0` (Soroban CLI) | Contract building, deployment, and simulation | `cargo install --locked stellar-cli` or via Homebrew / binary |
| **PostgreSQL** | `>= 14.x` (or Docker) | Transaction records, idempotency keys, API keys | [postgresql.org](https://postgresql.org) or `docker compose` |
| **Git** | `>= 2.30` | Version control | [git-scm.com](https://git-scm.com) |
| **Stellar Wallet** | Browser extension | Freighter or Lobstr wallet for transaction signing | [Freighter](https://freighter.app) / [Lobstr](https://lobstr.co) |

---

## Step-by-Step Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/Lex-Studios/Stellar-Spend.git
cd Stellar-Spend
```

---

### Step 2: Frontend & Node.js Dependencies

Install all root dependencies:

```bash
npm install
```

Verify Node.js version compatibility:
```bash
node -v   # Must output >= v20.0.0
npm -v    # Must output >= 10.0.0
```

---

### Step 3: Rust & Soroban Toolchain Setup

1. **Install Rust and WebAssembly compilation target:**
   ```bash
   # Install Rust stable if not installed
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
   source "$HOME/.cargo/env"

   # Add WebAssembly target
   rustup target add wasm32-unknown-unknown

   # Install Cargo development tools
   cargo install cargo-audit --locked
   ```

2. **Install the Stellar CLI (formerly Soroban CLI):**
   ```bash
   cargo install --locked stellar-cli --features opt
   ```

3. **Verify CLI installations:**
   ```bash
   rustc --version
   cargo --version
   stellar --version
   ```

---

### Step 4: Database Setup (PostgreSQL)

Stellar-Spend requires PostgreSQL to store transaction histories, API keys, and notification records.

#### Option A: Docker Compose (Recommended)

```bash
docker compose up -d postgres
```

#### Option B: Local PostgreSQL Service

```bash
# Create local database
createdb stellar_spend

# Apply migration files in numerical sequence
psql stellar_spend < migrations/001_create_transactions.sql
psql stellar_spend < migrations/002_add_transaction_analytics_fields.sql
psql stellar_spend < migrations/003_create_idempotency_keys.sql
psql stellar_spend < migrations/004_create_transaction_notifications.sql
psql stellar_spend < migrations/005_create_api_keys.sql
psql stellar_spend < migrations/006_create_webhook_deliveries.sql
psql stellar_spend < migrations/007_create_user_profiles.sql
psql stellar_spend < migrations/008_create_corridor_overrides.sql
psql stellar_spend < migrations/009_create_settlement_batches.sql
psql stellar_spend < migrations/010_create_escrow_events.sql
psql stellar_spend < migrations/011_create_contract_audit_log.sql
```

---

### Step 5: Environment Variables Configuration

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Open `.env.local` and set required configuration keys:

```bash
# ==========================================
# Core Application Configuration
# ==========================================
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stellar_spend

# ==========================================
# Stellar & Soroban RPC Configuration
# ==========================================
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Browser-exposed Stellar settings (Required for Freighter wallet)
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_STELLAR_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# ==========================================
# Base Chain & Paycrest Configuration
# ==========================================
BASE_RPC_URL=https://mainnet.base.org
BASE_PRIVATE_KEY=0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
BASE_RETURN_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_BASE_RETURN_ADDRESS=0x0000000000000000000000000000000000000000

PAYCREST_API_KEY=dev_paycrest_key
PAYCREST_WEBHOOK_SECRET=dev_webhook_secret
```

> **Security Note:** Secrets like `BASE_PRIVATE_KEY`, `PAYCREST_API_KEY`, and `PAYCREST_WEBHOOK_SECRET` must **never** use the `NEXT_PUBLIC_` prefix.

---

### Step 6: Build & Test Soroban Contracts

The project contains four Soroban contracts in the `contracts/` directory:
1. `escrow` — USDC escrow during bridge operations
2. `fee-manager` — Calculation and collection of protocol fees
3. `treasury` — Protocol fee accumulation and payouts
4. `multisig-authority` — Multi-signer administrative authority

Build all smart contracts to WebAssembly:

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
cd ..
```

Run contract unit and integration tests:

```bash
cd contracts
cargo test --workspace
cd ..
```

---

### Step 7: Start Next.js Development Server

Start the local development server:

```bash
npm run dev
```

Open your browser:
- **Application UI**: [http://localhost:3001](http://localhost:3001)
- **Interactive Swagger OpenAPI Docs**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- **Health check endpoint**: `curl http://localhost:3001/api/health`

---

## Contract Development Workflow

### Contract Linting and Formatting

Run Clippy and Rustfmt checks before committing contract code:

```bash
# Format Rust contract code
cargo fmt --workspace --manifest-path contracts/Cargo.toml

# Check for Clippy warnings (strict mode matching CI)
cargo clippy --workspace --manifest-path contracts/Cargo.toml -- -D warnings

# Security audit on Rust dependencies
./scripts/audit-contracts.sh
```

### Deploying Contracts to Testnet

To deploy a contract to Stellar Testnet using the automated deployment script:

```bash
# Create a testnet identity if you haven't yet
stellar keys generate --network testnet admin
ADMIN_SECRET=$(stellar keys show admin)

# Run deployment script
./scripts/deploy-contract.sh testnet escrow $ADMIN_SECRET
```

The script compiles the WASM, deploys the contract to Testnet, and writes the resulting contract ID to `contracts/.deployed-testnet.json`.

---

## Frontend & API Development Workflow

### Code Quality & Validation Checks

Run checks locally to ensure CI passes:

```bash
# ESLint
npm run lint

# TypeScript type check (zero errors required)
npm run type:check

# Prettier formatting check
npm run format:check

# Run Storybook for isolated UI components
npm run storybook
```

---

## Troubleshooting Guide

### Rust & Soroban Build Errors

#### 1. `error[E0512]: cannot transmute between types of different sizes` (`ethnum` mismatch)
- **Cause**: An outdated dependency pulled in an older `ethnum` version when `soroban-sdk` versions are mismatched.
- **Fix**: Stellar-Spend workspace pins `soroban-sdk` to version `22`. Ensure all `contracts/*/Cargo.toml` files specify `soroban-sdk = "22"` and run:
  ```bash
  cargo update --manifest-path contracts/Cargo.toml
  ```

#### 2. `error: target 'wasm32-unknown-unknown' not found`
- **Cause**: The WebAssembly target is not installed in your Rust toolchain.
- **Fix**:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```

#### 3. `ContractError::MigrationRequired` or `ContractError::SchemaVersionUnsupported`
- **Cause**: The deployed contract schema version does not match the expected `SCHEMA_VERSION` in the code.
- **Fix**: When modifying contract storage layouts:
  1. Call `migrate()` on the contract instance using admin authorization.
  2. For tests, ensure `with_legacy_v1_state()` seeds matching schemas.

---

### Stellar RPC & Horizon Errors

#### 1. `tx_bad_seq` (Bad Sequence Number)
- **Cause**: The account sequence number used in `TransactionBuilder` is out of date because another transaction was submitted concurrently or cached.
- **Fix**: Always query the latest sequence number from Horizon immediately before building the transaction:
  ```ts
  const account = await server.getAccount(publicKey);
  const tx = new TransactionBuilder(account, ...);
  ```

#### 2. `op_underfunded` / `Simulation failed: resulting balance is not within the allowed range`
- **Cause**: The Stellar account does not hold sufficient XLM to cover the base reserve (minimum 2 XLM + 0.5 XLM per sub-entry/trustline) plus the transaction fee, or USDC balance is lower than the transfer amount.
- **Fix**:
  - Fund the testnet account via Friendbot: `curl "https://friendbot.stellar.org?addr=<PUBLIC_KEY>"`
  - Ensure the user has added a USDC trustline (`NEXT_PUBLIC_STELLAR_USDC_ISSUER`).
  - Switch fee payment method from `native` (XLM) to `stablecoin` (USDC) if XLM is low.

#### 3. `HostError: Error(Value, InvalidInput)` during `simulateTransaction`
- **Cause**: Soroban contract invocation arguments (`ScVal`) are malformed or invalid types.
- **Fix**:
  - Verify parameter order matches the contract function signature.
  - Ensure `Address` objects are correctly converted using `new Address(key).toScVal()`.
  - For integers (`i128`), use `nativeToScVal(BigInt(amount), { type: 'i128' })`.

#### 4. `rpc.Api.isSimulationError(simResult)` (Resource Footprint Missing)
- **Cause**: Submitting a transaction without assembling the simulation result.
- **Fix**: Always assemble the transaction with simulation data before sending:
  ```ts
  const simResult = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) throw new Error(simResult.error);
  const preparedTx = rpc.assembleTransaction(tx, simResult).build();
  ```

---

### Wallet & Browser Extension Issues

#### 1. `Freighter is set to Testnet. Please switch to Mainnet.` (or vice versa)
- **Cause**: The active network in Freighter does not match the network passphrase configured in the app.
- **Fix**:
  - Open the Freighter browser extension → Settings → Network.
  - Select the network matching your `.env.local` (`Mainnet` or `Testnet`).

#### 2. `Freighter extension is not installed` / `Lobstr provider not on window`
- **Cause**: Browser extension is locked, not installed, or origin is not HTTPS/localhost.
- **Fix**:
  - Unlock Freighter/Lobstr extension.
  - Access the local development server strictly via `http://localhost:3001`.

---

### Database & Environment Issues

#### 1. `Error: Invalid environment configuration`
- **Cause**: Required environment variables are missing from `.env.local` or fail schema validation in `src/lib/env.ts`.
- **Fix**:
  - Compare your `.env.local` against `.env.example`.
  - Ensure all required keys (e.g., `PAYCREST_API_KEY`, `BASE_PRIVATE_KEY`, `STELLAR_SOROBAN_RPC_URL`) are populated.

#### 2. `ECONNREFUSED 127.0.0.1:5432` (PostgreSQL Connection Error)
- **Cause**: PostgreSQL service is not running or port 5432 is blocked.
- **Fix**:
  - If using Docker: `docker compose up -d postgres`
  - If using local service: `sudo service postgresql start` or `brew services start postgresql`

---

## Clean Machine Verification Checklist

To verify your clean development setup from scratch:

- [ ] `git clone` into an empty directory
- [ ] `npm install` installs without peer dependency errors
- [ ] `rustup target add wasm32-unknown-unknown` configured
- [ ] `cargo test --workspace` passes in `contracts/`
- [ ] `docker compose up -d postgres` (or local PostgreSQL) active
- [ ] `cp .env.example .env.local` filled out
- [ ] `npm run dev` starts dev server on `http://localhost:3001`
- [ ] `curl http://localhost:3001/api/health` returns `{"status":"ok"}`
- [ ] `http://localhost:3001/api/docs` loads Swagger API documentation
