# Stellar-Spend Soroban Contracts

Four contracts: `escrow`, `fee-manager`, `treasury`, `multisig-authority`. Shared
error codes, auth helpers, token wrapper, and validation helpers live in `shared`
(`stellar-spend-shared`).

## Toolchain note

`soroban-sdk` is pinned to `22` workspace-wide. Earlier `20.x` pins pull in an
`ethnum` version that fails to compile (`E0512`) under current stable rustc — if
`cargo build` ever reports that error again, it means something re-pinned the SDK
back down; bump it, not the toolchain.

## Upgrade procedure (issue #817)

Every contract stores a schema version in instance storage and exposes two
entrypoints:

- `upgrade(new_wasm_hash)` — swaps the deployed WASM via
  `env.deployer().update_current_contract_wasm(...)`. Storage is untouched by the
  swap.
- `migrate()` — converts persisted state from the previous schema to the current
  one. Returns the version migrated from. (`multisig-authority`'s `migrate` also
  takes an explicit `admin` argument, matching its other admin entrypoints.)

**All other entrypoints refuse to run against a stale schema**
(`ContractError::MigrationRequired`) or a schema newer than the build understands
(`ContractError::SchemaVersionUnsupported`). This means an upgrade that isn't
followed by `migrate` fails loudly and immediately, rather than silently decoding
old bytes into the new type.

### Steps to upgrade a deployed contract

1. Bump the contract's `SCHEMA_VERSION` constant and extend its `migrate()` match
   arm to convert the old layout to the new one (see `escrow`'s v1→v2 arm, which adds
   `fee_bps: 0` to every existing deposit, for the pattern to follow).
2. Build and deploy the new WASM.
3. Call `upgrade(new_wasm_hash)` (admin-authorized).
4. Call `migrate()` in the same transaction where possible — every other entrypoint
   is blocked until this runs.
5. Verify with the contract's `schema_version()` view call.

### Test harness

Each contract's `test_utils` module has a `seed_v1_state(...)` / `with_legacy_v1_state()`
helper that writes a genuine old-shaped record directly into instance storage
(bypassing the current `init`), so `tests/upgrade.rs` in each contract exercises the
real migration path — decode old bytes, convert, verify every existing entry is
still readable and semantically unchanged — rather than a synthetic shortcut.

Run per-contract: `cargo test -p escrow --test upgrade` (and similarly for
`fee-manager`, `treasury`, `multisig-authority`).

## Error codes (issue #816)

All four contracts return the single [`stellar_spend_shared::errors::ContractError`]
enum. Discriminants are part of the on-chain ABI — a client decodes
`ContractError::Unauthorized` as the integer `1`, not by name — so new variants are
always appended, never renumbered or reused.
