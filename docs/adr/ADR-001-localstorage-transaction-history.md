# ADR-001: localStorage Instead of Database for Transaction History

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Stellar-Spend core team

---

## Context

Stellar-Spend is a client-facing off-ramp application. Users initiate USDC → fiat transfers from their own Stellar wallets. The question arose: where should completed transaction records and saved beneficiary data live?

Options considered:

1. **Server-side PostgreSQL database** — centralised persistence, requires user authentication system.
2. **Browser localStorage** — client-side persistence, no auth required, zero infrastructure cost.
3. **Hybrid** — critical order IDs in the database, display data in localStorage.

The application already uses a PostgreSQL database for operational records (idempotency keys, API keys, audit logs). The concern was whether _transaction display history_ and _beneficiary bookmarks_ needed the same durability guarantees.

Key constraints:

- No user account system exists; wallets are identified by public key only.
- The Stellar wallet (Freighter / Lobstr) already acts as the user's identity.
- Cross-device sync was not a stated requirement at the time of this decision.
- Paycrest and Allbridge maintain the ground-truth order status on their own systems.

---

## Decision

Transaction history records and saved beneficiaries are stored in the browser's **localStorage**, keyed by wallet address. Sensitive beneficiary fields (account number, bank code) are AES-256-CBC encrypted before storage (`BeneficiaryStorage` in `src/lib/beneficiary-storage.ts`).

The server database stores _operational_ data — idempotency keys, API keys, audit logs, notification preferences — that must survive server restarts and support server-side queries.

---

## Consequences

**Positive:**

- Zero infrastructure cost for storing display-only data.
- No user authentication layer required to view past transactions.
- Users retain full data sovereignty; clearing the browser clears their history.
- Development velocity — localStorage is immediately available without migrations.

**Negative / Trade-offs:**

- Transaction history is **device-local**: switching browsers or devices means history is lost.
- No server-side search, filtering, or aggregation over a user's full history.
- localStorage has a ~5 MB browser limit; very active users could hit this over time.
- In-browser encryption relies on `BENEFICIARY_ENCRYPTION_KEY` from the server environment, which is fetched client-side — the key is not truly secret on the client.

**Future path:**  
If cross-device sync or server-side analytics become requirements, a lightweight wallet-keyed backend store (e.g., a `user_transactions` table with `wallet_address` as the partition key and signed JWTs for auth) would be a natural migration. The localStorage schema is already structured to mirror a typical DB row shape, making that migration straightforward.

---

_Related: [[ADR-006-idempotency-implementation]], [[ADR-003-adapter-pattern-external-services]]_
