# ADR-008: Soroban Escrow Trust Model

**Status:** Accepted  
**Date:** 2026-06-27  
**Deciders:** Stellar-Spend core team

---

## Context

The `contracts/escrow` Soroban contract holds USDC on behalf of users during the off-ramp flow — from the moment the user signs the bridge transaction until Paycrest confirms fiat settlement. This creates a window (typically 5–15 minutes) where USDC is held in escrow.

The key trust question: **who has the authority to release or refund the escrowed USDC, and under what conditions?**

Trust model options considered:

**Option A: Single admin key**  
A single server-controlled private key can release or refund at will. Simple, but a single point of failure/compromise.

**Option B: Time-lock with user refund right**  
The contract enforces a timeout (`set_timeout`). After the timeout, the depositor (user) can unilaterally refund. The settlement authority can release before timeout.

**Option C: Multi-sig release**  
Both the server and a second party (e.g., Paycrest) must sign to release. Strong trust model, but requires Paycrest to integrate a Stellar signing step — not feasible in the near term.

**Option D: Oracle-based conditional release**  
An on-chain oracle confirms Paycrest settlement before release. Strong guarantees but high complexity and dependency.

---

## Decision

The escrow contract uses **Option B**: a time-locked escrow with dual authority.

```
State machine:

  [Deposited]
      │
      ├─(settlement authority calls release())─► [Released]   funds → settlement address
      │
      └─(timeout elapsed, depositor calls refund())─► [Refunded]   funds → depositor
```

Key properties:

- `release()` can only be called by the designated `settlement_authority` (server-controlled key)
- `refund()` can only be called by the original `depositor` after `timeout_ledger` has passed
- Once `release()` succeeds, `refund()` is blocked (and vice versa) — the contract enforces mutual exclusion
- Deposit IDs are unique; replay attacks are prevented by rejecting duplicate deposit IDs
- The contract is pausable by the admin for emergency situations

Timeout ledger calculation:

```
timeout_ledger = current_ledger + (desired_seconds / 5)
```

Stellar produces a ledger approximately every 5 seconds.

The server sets a conservative timeout (e.g., 1 hour = 720 ledgers) to allow for bridge and Paycrest processing delays. If settlement is not confirmed within that window, users can self-refund without server intervention.

---

## Consequences

**Positive:**

- Users have a guaranteed refund path even if the server is unavailable.
- No single-key catastrophic loss scenario — the settlement authority cannot drain funds without triggering release events on-chain.
- Clear auditability: every state transition (`deposit`, `release`, `refund`) is an on-chain event.
- Idempotent operations — releasing or refunding twice has no additional effect.

**Negative / Trade-offs:**

- The timeout window must be long enough for legitimate settlements to complete (including Paycrest's bank processing). Setting it too short causes premature refund eligibility.
- The server must monitor the escrow and process releases promptly; delayed releases risk timeout.
- The `settlement_authority` key requires robust key management (HSM or equivalent) — compromise allows unilateral release of all active deposits.
- Multi-sig (Option C) would be stronger but is deferred until Paycrest supports Stellar signing.

**Key management:**

- `settlement_authority` private key is stored as `BASE_PRIVATE_KEY` in the server environment (never in client code)
- Key rotation requires updating the contract via the admin `migrate()` function
- All key usage is logged in the audit log

---

_Related: [[ADR-001-localstorage-transaction-history]], [[ADR-007-onramp-architecture]]_
