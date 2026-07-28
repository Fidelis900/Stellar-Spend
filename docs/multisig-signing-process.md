# Multi-Signature Settlement Authority

This document describes the operational signing process for Stellar-Spend's M-of-N settlement authority.

---

## Overview

High-value release and upgrade actions require approval from multiple signers before execution.
The authority is implemented in two layers:

| Layer     | Location                         | Role                                                                                              |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| On-chain  | `contracts/multisig-authority/`  | Soroban contract that stores proposals and signature counts, emits audit events                   |
| Off-chain | `src/lib/multisig-settlement.ts` | TypeScript coordinator that persists proposals/signatures to Postgres and enforces the same rules |

---

## Configuration

Set the following in environment / runtime config before deploying:

| Parameter                   | Description                                                   | Example                            |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `MULTISIG_THRESHOLD`        | M — minimum signatures required                               | `2`                                |
| `MULTISIG_SIGNERS`          | Comma-separated signer addresses                              | `addr1,addr2,addr3`                |
| `MULTISIG_HIGH_VALUE_LIMIT` | Transfers above this (USDC base units) require full threshold | `1000000` (= 1 USDC at 6 decimals) |

Below the high-value limit, a single signer suffices. Set to `0` to always require the full threshold.

---

## Step-by-Step: Approving a High-Value Release

### 1. Proposer creates the proposal

```ts
const svc = new MultisigSettlementService(config);
const proposal = await svc.propose(
  'signer-address-alice', // proposer (must be registered signer)
  'Release escrow #123 to Bob', // description
  '0xTargetContractOrAddress', // target
  5_000_000n, // value in base units (above high-value limit)
  aliceSignature, // proposer's cryptographic signature
);
console.log('Proposal ID:', proposal.id);
```

Alice's signature is automatically recorded. The proposal expires after 24 hours.

### 2. Co-signers review and sign

Each additional signer independently fetches the proposal and adds their signature:

```ts
const status = await svc.sign(proposal.id, 'signer-address-bob', bobSignature);
console.log(`${status.collected}/${status.required} signatures collected`);
```

### 3. Execute when quorum is reached

Once `status.ready === true`:

```ts
const approvedValue = await svc.execute(proposal.id, 'signer-address-bob');
// approvedValue === 5_000_000n
// Caller should now invoke the on-chain release with this value
```

---

## Audit Trail

Every event is written to structured logs (`multisig:signature_collected`) and to the `multisig_signatures` table.  
The audit record includes:

- `proposalId` — links to the `multisig_proposals` row
- `signer` — address of the co-signer
- `target` — contract/address the action targets
- `value` — amount approved
- `signedAt` — ISO-8601 timestamp

Run this query to retrieve the full audit trail for a proposal:

```sql
SELECT p.id, p.description, p.target, p.value, p.executed,
       s.signer, s.signed_at
FROM   multisig_proposals p
JOIN   multisig_signatures s ON s.proposal_id = p.id
WHERE  p.id = $1
ORDER  BY s.signed_at ASC;
```

---

## Admin Operations

Adding or removing signers and changing the threshold are admin-only operations and themselves require the current threshold (on-chain) or direct admin auth (off-chain service constructor).

| Operation        | On-chain function                     | Notes                                           |
| ---------------- | ------------------------------------- | ----------------------------------------------- |
| Add signer       | `add_signer(admin, new_signer)`       | Admin auth required                             |
| Remove signer    | `remove_signer(admin, signer)`        | Blocked if removal would make quorum impossible |
| Change threshold | `set_threshold(admin, new_threshold)` | Must remain ≤ signer count                      |

---

## Security Notes

- Proposals expire after 24 hours. Never leave a proposal open indefinitely.
- A signer can only sign once per proposal (enforced on-chain and off-chain).
- The on-chain contract emits `proposed`, `signed`, and `executed` events — index these for real-time monitoring.
- Rotate signer keys immediately if compromise is suspected; use `remove_signer` + `add_signer`.
