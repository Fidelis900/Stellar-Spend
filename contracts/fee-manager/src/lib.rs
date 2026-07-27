//! Fee calculation and emergency circuit breaker for Stellar-Spend.
//!
//! Owns the flat fee rate applied to bridge transfers and the pause switch that
//! halts fee-bearing operations during an incident. Tiered, amount-dependent fee
//! schedules live in the `treasury` contract; this one applies a single rate.
//!
//! All errors use the canonical [`ContractError`] from `stellar-spend-shared`.
//!
//! # Dead code removed (issue #815)
//!
//! The previous revision carried three constructs that could never do anything:
//!
//! * `VERSION` / `version()` built a `String` via `String::from_slice`, which is not
//!   a `soroban_sdk::String` constructor. Replaced with `contractmeta!` — version
//!   metadata belongs in the WASM custom section, not in a runtime entrypoint that
//!   costs a host call to read.
//! * `migrate(new_version)` took a version argument, emitted an event, and returned.
//!   It touched no storage, so calling it did nothing an off-chain event could not do
//!   for free. Replaced with a real schema migration (issue #817).
//! * `calculate_fee` cast a possibly-negative `i128` through `u128` before
//!   multiplying, so a negative amount wrapped to an enormous positive fee instead of
//!   being rejected. The branch handling that case did not exist at all.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short, Address, BytesN, Env, String,
};
use stellar_spend_shared::{
    errors::ContractError,
    validation::{
        basis_points_of, check_schema_version, require_basis_points, require_positive_amount,
        require_string_len, MAX_BASIS_POINTS,
    },
};

contractmeta!(key = "version", val = "1.0.0");
contractmeta!(key = "contract", val = "stellar-spend-fee-manager");

/// Current storage layout version.
pub const SCHEMA_VERSION: u32 = 2;

/// Ceiling on the configurable default rate (5%), matching the treasury's per-tier cap.
pub const MAX_DEFAULT_FEE_BP: u32 = 500;

/// Rate applied when a contract initialised under schema v1 is migrated forward.
pub const MIGRATED_DEFAULT_FEE_BP: u32 = 50;

/// Instance TTL extension (~30 days) applied on state-changing calls.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;
/// Only pay to extend when remaining TTL drops below ~6 days.
pub const INSTANCE_TTL_THRESHOLD: u32 = 103_680;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Paused,
    /// Default fee rate in basis points. Added in schema v2.
    DefaultRate,
    Schema,
}

#[contract]
pub struct FeeManagerContract;

#[contractimpl]
impl FeeManagerContract {
    /// Initialise with an admin and a starting fee rate.
    pub fn init(env: Env, admin: Address, default_fee_bp: u32) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Schema) {
            return Err(ContractError::AlreadyInitialized);
        }
        require_basis_points(default_fee_bp, MAX_DEFAULT_FEE_BP)?;
        admin.require_auth();

        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Paused, &false);
        storage.set(&DataKey::DefaultRate, &default_fee_bp);
        storage.set(&DataKey::Schema, &SCHEMA_VERSION);
        Self::bump_instance_ttl(&env);

        env.events().publish((symbol_short!("init"),), admin);
        Ok(())
    }

    /// Human-readable contract version, sourced from the same string as `contractmeta!`.
    pub fn version(env: Env) -> String {
        String::from_str(&env, "1.0.0")
    }

    /// Trip the circuit breaker. Admin only.
    ///
    /// `reason` is bounded because it is echoed into an event topic, and unbounded
    /// caller-supplied strings there are a metering hazard.
    pub fn pause(env: Env, reason: String) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        Self::require_admin(&env)?;
        require_string_len(&reason, 128)?;

        if Self::paused_flag(&env) {
            return Err(ContractError::Paused);
        }

        env.storage().instance().set(&DataKey::Paused, &true);
        Self::bump_instance_ttl(&env);
        env.events().publish((symbol_short!("pause"),), reason);
        Ok(())
    }

    /// Reset the circuit breaker. Admin only.
    pub fn unpause(env: Env) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        Self::require_admin(&env)?;

        if !Self::paused_flag(&env) {
            return Err(ContractError::InvalidInput);
        }

        env.storage().instance().set(&DataKey::Paused, &false);
        Self::bump_instance_ttl(&env);
        env.events().publish((symbol_short!("unpause"),), ());
        Ok(())
    }

    /// Whether the circuit breaker is currently tripped.
    ///
    /// Returns `false` for an uninitialised contract rather than erroring: callers
    /// use this as a cheap guard and a missing contract is not "paused".
    pub fn is_paused(env: Env) -> bool {
        Self::paused_flag(&env)
    }

    /// Fee for `amount` at an explicit rate.
    pub fn calculate_fee(env: Env, amount: i128, fee_rate: u32) -> Result<i128, ContractError> {
        Self::require_current_schema(&env)?;
        if Self::paused_flag(&env) {
            return Err(ContractError::Paused);
        }
        require_positive_amount(amount)?;
        require_basis_points(fee_rate, MAX_BASIS_POINTS)?;

        basis_points_of(amount, fee_rate)
    }

    /// Fee for `amount` at the configured default rate.
    pub fn calculate_default_fee(env: Env, amount: i128) -> Result<i128, ContractError> {
        let rate = Self::default_rate(env.clone())?;
        Self::calculate_fee(env, amount, rate)
    }

    /// The configured default fee rate, in basis points.
    pub fn default_rate(env: Env) -> Result<u32, ContractError> {
        Self::require_current_schema(&env)?;
        env.storage()
            .instance()
            .get(&DataKey::DefaultRate)
            .ok_or(ContractError::NotInitialized)
    }

    /// Update the default fee rate. Admin only.
    pub fn set_default_rate(env: Env, fee_bp: u32) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        Self::require_admin(&env)?;
        require_basis_points(fee_bp, MAX_DEFAULT_FEE_BP)?;

        env.storage().instance().set(&DataKey::DefaultRate, &fee_bp);
        Self::bump_instance_ttl(&env);
        env.events().publish((symbol_short!("rate"),), fee_bp);
        Ok(())
    }

    // ── Upgrade surface (issue #817) ──────────────────────────────────────────

    pub fn schema_version(env: Env) -> Result<u32, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Schema)
            .ok_or(ContractError::NotInitialized)
    }

    /// Replace the contract WASM. Admin only. Run `migrate` immediately after.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        Self::require_admin(&env)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.events().publish((symbol_short!("upgrade"),), ());
        Ok(())
    }

    /// Convert persisted state to [`SCHEMA_VERSION`]. Returns the version migrated from.
    pub fn migrate(env: Env) -> Result<u32, ContractError> {
        Self::require_admin(&env)?;

        let stored: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Schema)
            .ok_or(ContractError::NotInitialized)?;

        if stored == SCHEMA_VERSION {
            return Err(ContractError::SchemaAlreadyCurrent);
        }
        if stored > SCHEMA_VERSION {
            return Err(ContractError::SchemaVersionUnsupported);
        }

        if stored == 1 {
            // v1 had no DefaultRate key at all. Backfill it rather than leaving
            // `default_rate` to fail on every call after the WASM swap.
            env.storage()
                .instance()
                .set(&DataKey::DefaultRate, &MIGRATED_DEFAULT_FEE_BP);
        }

        env.storage()
            .instance()
            .set(&DataKey::Schema, &SCHEMA_VERSION);
        Self::bump_instance_ttl(&env);
        env.events()
            .publish((symbol_short!("migrate"),), (stored, SCHEMA_VERSION));
        Ok(stored)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) -> Result<Address, ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        Ok(admin)
    }

    fn require_current_schema(env: &Env) -> Result<(), ContractError> {
        check_schema_version(
            env.storage().instance().get(&DataKey::Schema),
            SCHEMA_VERSION,
        )
    }

    fn paused_flag(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }
}

#[cfg(feature = "testutils")]
pub mod test_utils;

#[cfg(test)]
mod test;
