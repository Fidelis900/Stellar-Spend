# Glossary — Stellar-Spend Domain Terms

This glossary defines domain-specific terms used across the codebase and documentation.
It is intended for new contributors and is cross-referenced from the [onboarding guide](./onboarding.md) and the [README](../README.md).

> Terms are listed alphabetically. Stellar/Soroban-specific terms are marked **[Stellar]**.

---

## A

### Allbridge
Third-party cross-chain bridge protocol used to move USDC from Stellar to Base.
The integration is described in [docs/allbridge-integration.md](./allbridge-integration.md).
See also: [ADR-002](./adr/ADR-002-allbridge-sdk-dynamic-import.md).

### Amount Mismatch
A reconciliation discrepancy where the USDC amount recorded on one chain (Stellar or Base) differs from the amount recorded by the payout provider (Paycrest). Triggers a `high`-severity alert. See [reconciliation](#reconciliation).

---

## B

### Base (Chain)
An Ethereum Layer-2 network (OP Stack) operated by Coinbase. After the Allbridge bridge step, USDC lands on Base and is forwarded to Paycrest.

### Beneficiary
The end recipient of the fiat payout — typically identified by a bank account number and institution code.

### Bridge
The act of moving tokens from one blockchain to another. In Stellar-Spend the bridge moves USDC from **Stellar** → **Base** via Allbridge.

---

## C

### Corridor
A supported origin/destination pair for an off-ramp transfer, e.g. `USDC/Stellar → NGN/Nigeria`.
Corridors define supported currencies, institutions, and amount limits.
Configuration lives in `src/lib/corridor-config.ts`.

---

## D

### Discrepancy
A data inconsistency found during [reconciliation](#reconciliation) between internal records and external provider records. Types: `missing_stellar`, `missing_base`, `missing_paycrest`, `amount_mismatch`, `status_mismatch`, `unsettled_order`.

---

## F

### Fiat
Traditional government-issued currency (NGN, KES, GHS, etc.) that the beneficiary receives in their bank account after the off-ramp flow completes.

### Freighter
A browser extension wallet for the Stellar network. One of two supported wallet connectors (the other is [Lobstr](#lobstr)).

---

## H

### Horizon
The Stellar REST API server. Used server-side to check on-chain transaction status and account balances. Configured via `STELLAR_HORIZON_URL`.

---

## L

### Lobstr
A Stellar mobile and web wallet application that can be used as an alternative to Freighter for signing transactions.

---

## O

### Off-ramp
The process of converting cryptocurrency (USDC) to fiat currency and depositing it into a traditional bank account. The core flow of Stellar-Spend. See the [offramp flow diagram](./diagrams/offramp-flow.md).

### On-ramp
The reverse process: converting fiat into cryptocurrency. Architecture described in [ADR-007](./adr/ADR-007-onramp-architecture.md) and [docs/onramp-flow.md](./onramp-flow.md).

---

## P

### Paycrest
The fiat payout provider. Accepts Base USDC and settles local currency (NGN, KES, GHS, …) to a bank account.
Integration documented in [docs/paycrest-integration.md](./paycrest-integration.md).

### Payout Order
A payment instruction created on the Paycrest platform. Contains the recipient's bank details, amount, currency, and a settlement address to which Base USDC must be sent.
See `POST /api/offramp/paycrest/order`.

---

## R

### Reconciliation
The automated process of comparing internal transaction records against Stellar, Base, and Paycrest to detect discrepancies and ensure all funds are accounted for.
Core logic lives in `src/lib/reconciliation.ts`.
API: `POST /api/offramp/reconciliation`.

---

## S

### Settlement
The final transfer of fiat funds from Paycrest to the beneficiary's bank account. A payout order moves from `pending` → `completed` when settlement succeeds.

### Settlement Address
The Base blockchain address to which Base USDC must be sent to fund a Paycrest payout order.

### Soroban **[Stellar]**
The smart-contract platform built into the Stellar network, using WebAssembly (Wasm) contracts. Stellar-Spend uses Soroban for the escrow contract.
Handbook: [docs/stellar-soroban-handbook.md](./stellar-soroban-handbook.md).
ADR: [ADR-008](./adr/ADR-008-soroban-escrow-trust-model.md).

### Stablecoin
A cryptocurrency pegged to a fiat currency. Stellar-Spend supports **USDC** (USD Coin) and **USDT** (Tether) on Stellar.

### Stellar **[Stellar]**
An open-source, decentralized blockchain optimized for fast, low-cost payments and asset issuance. Stellar-Spend users hold USDC on Stellar and initiate off-ramp transfers from here.

---

## T

### Trustline **[Stellar]**
An opt-in record on the Stellar ledger that allows an account to hold a specific asset issued by a specific issuer. A USDC trustline must exist before a user can receive or send Stellar USDC.

---

## U

### USDC
USD Coin — a fiat-backed stablecoin pegged 1:1 to the US dollar, issued on multiple chains including Stellar and Base.

### USDT
Tether — another USD-pegged stablecoin supported on Stellar.

### Unsettled Order
A Paycrest payout order that remains in a non-terminal state (`pending`, `processing`) longer than expected. Detected during reconciliation as an `unsettled_order` discrepancy.

---

## X

### XDR **[Stellar]**
External Data Representation — the binary serialisation format Stellar uses for transactions and other protocol messages. Stellar-Spend builds a Soroban XDR, the user signs it in their wallet, and the server submits it to the network.

---

*Keep this glossary alphabetized. To add a term, open a PR and follow the existing format.*
