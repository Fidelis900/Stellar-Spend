//! Canonical error codes shared across all Stellar-Spend contracts.
//!
//! **Stability guarantee**: once a variant is assigned a numeric discriminant
//! and deployed on-chain, that number must never change.  Add new variants at
//! the end; never reorder or remove existing ones.

use soroban_sdk::contracterror;

/// All error variants that any Stellar-Spend contract may return.
///
/// The `#[contracterror]` macro makes these usable as `Result<T, ContractError>`
/// return values from `#[contractimpl]` functions and maps each variant to a
/// stable `u32` code visible to clients.
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum ContractError {
    /// Caller is not authorised to perform the requested operation.
    /// Code: 1
    Unauthorized = 1,

    /// A numeric argument (amount, rate, threshold…) is outside the valid range.
    /// Code: 2
    InvalidAmount = 2,

    /// The requested resource (deposit, proposal, signer…) does not exist.
    /// Code: 3
    NotFound = 3,

    /// The operation has already been completed (released / refunded / executed).
    /// Code: 4
    AlreadyProcessed = 4,

    /// The deadline or timeout ledger has passed (or has not been reached yet
    /// for early-refund guards).
    /// Code: 5
    Expired = 5,

    /// The number of collected signatures is below the required threshold.
    /// Code: 6
    BelowThreshold = 6,

    /// The contract is currently paused; all state-changing calls are rejected.
    /// Code: 7
    Paused = 7,

    /// A re-entrant call was detected; the reentrancy lock is held.
    /// Code: 8
    Reentrant = 8,

    /// An arithmetic operation would overflow or underflow.
    /// Code: 9
    Overflow = 9,

    /// A cross-contract call (token transfer/balance/approve/allowance) failed.
    /// Code: 10
    ContractFault = 10,

    /// `init` called on a contract that already holds state.
    /// Code: 11
    AlreadyInitialized = 11,

    /// An entrypoint was called before `init` populated instance storage.
    /// Code: 12
    NotInitialized = 12,

    /// State was written by an older schema version; `migrate` must run first.
    /// Code: 13
    MigrationRequired = 13,

    /// Stored schema version is newer than this build understands.
    /// Code: 14
    SchemaVersionUnsupported = 14,

    /// `migrate` called when the stored schema already matches the current version.
    /// Code: 15
    SchemaAlreadyCurrent = 15,

    /// A caller-supplied value (string length, tier count, duplicate entry…)
    /// failed a validation rule not covered by a more specific code above.
    /// Code: 16
    InvalidInput = 16,
}
