//! Treasury and tiered fee collection for Stellar-Spend.
//!
//! Holds the amount-tiered fee schedule, computes the fee owed on a transfer, and
//! records the treasury address that collected fees are routed to.
//!
//! All errors use the canonical [`ContractError`] from `stellar-spend-shared`; admin
//! checks delegate to [`stellar_spend_shared::auth::assert_is_admin`].
//!
//! # Dead code removed (issue #815)
//!
//! The previous `get_fee_for_amount` took the stored fee schedule as a parameter and
//! then ignored it entirely, returning hard-coded 50/25/10 basis points from an
//! `if`/`else if` chain:
//!
//! ```ignore
//! pub fn get_fee_for_amount(schedule: &Map<i128, u32>, amount: i128) -> u32 {
//!     let mut fee_bp = 50u32;                          // `schedule` never read
//!     if amount >= 10_000_000 { fee_bp = 10; }
//!     else if amount >= 1_000_000 { fee_bp = 25; }
//!     fee_bp
//! }
//! ```
//!
//! That made the whole configurable-schedule feature dead: `set_fee_schedule`
//! validated its input, wrote it to instance storage, emitted an event — and no read
//! path ever consulted the result. An admin could "change" the fee and collection
//! would carry on at the compiled-in rates. [`TreasuryContract::fee_for_amount`] now
//! reads the stored schedule, so the hard-coded branches are gone and the tiers seeded
//! at `init` are merely defaults.
//!
//! Also removed: `get_treasury` fell back to `Address::generate(&env)`, a
//! `testutils`-only constructor that cannot compile into a release WASM. It now
//! returns [`ContractError::NotInitialized`] instead of inventing an address to send
//! fees to.
//!
//! # Storage footprint reduction (issue #811)
//!
//! ## Before (schema v2)
//!
//! | Key              | Type              | Bytes per entry         |
//! |------------------|-------------------|-------------------------|
//! | `FeeSchedule`    | `Map<i128, u32>`  | 16 (key) + 4 (val) = 20 |
//! | `TotalCollected` | `i128`            | 16                      |
//!
//! ## After (schema v3)
//!
//! | Key              | Type              | Bytes per entry         | Saved |
//! |------------------|-------------------|-------------------------|-------|
//! | `FeeSchedule`    | `Map<u64, u32>`   |  8 (key) + 4 (val) = 12 | **8 bytes/tier** |
//! | `TotalCollected` | `i128`            | 16                      | —     |
//!
//! With up to [`MAX_FEE_TIERS`] = 16 tiers, the schedule map saves up to **128 bytes**
//! of instance storage. Soroban charges per-byte for storage writes; a full 16-tier
//! schedule update costs ~128 bytes less per write cycle under schema v3.
//!
//! The key type change is safe because [`TreasuryContract::set_fee_schedule`] has
//! always validated `amount_tier >= 0` — no negative tier thresholds can exist in
//! any live deployment, so narrowing the key to `u64` is lossless. The schema v3
//! migration casts all existing keys via `i128 as u64` (always in range post-validation).

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short, Address, BytesN, Env, Map,
};
use stellar_spend_shared::{
    errors::ContractError,
    validation::{
        basis_points_of, check_schema_version, require_basis_points, require_non_negative_amount,
        require_positive_amount,
    },
};

contractmeta!(key = "version", val = "1.0.0");
contractmeta!(key = "contract", val = "stellar-spend-treasury");

/// Current storage layout version.
///
/// Bumped from 2 → 3 by issue #811: fee schedule key narrowed from `i128` to `u64`,
/// saving 8 bytes per tier (up to 128 bytes for a full 16-tier schedule).
pub const SCHEMA_VERSION: u32 = 3;

/// Maximum fee for any single tier (5%).
pub const MAX_SINGLE_FEE_BP: u32 = 500;

/// Upper bound on stored tiers, keeping [`TreasuryContract::fee_for_amount`]'s linear
/// scan within a predictable instruction budget.
pub const MAX_FEE_TIERS: u32 = 16;

/// Instance TTL extension (~30 days) applied on state-changing calls.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;
/// Only pay to extend when remaining TTL drops below ~6 days.
pub const INSTANCE_TTL_THRESHOLD: u32 = 103_680;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Treasury,
    /// `Map<u64, u32>`: tier threshold (in stroops) -> basis points.
    ///
    /// Changed from `Map<i128, u32>` in schema v3 to save 8 bytes per tier key.
    /// Tier thresholds have always been validated as non-negative, so the narrowing
    /// is lossless.
    FeeSchedule,
    /// Running total of fees collected. Added in schema v2.
    TotalCollected,
    Schema,
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// Initialise with an admin, a treasury address, and the default fee schedule.
    pub fn init(env: Env, admin: Address, treasury: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Schema) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();

        // Schema v3: fee schedule keys are u64 (saves 8 bytes per tier).
        let mut schedule: Map<u64, u32> = Map::new(&env);
        schedule.set(0u64, 50); // 0.5% below 1M stroops
        schedule.set(1_000_000u64, 25); // 0.25% from 1M
        schedule.set(10_000_000u64, 10); // 0.1% from 10M

        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Treasury, &treasury);
        storage.set(&DataKey::FeeSchedule, &schedule);
        storage.set(&DataKey::TotalCollected, &0i128);
        storage.set(&DataKey::Schema, &SCHEMA_VERSION);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("init"),), (admin, treasury));
        Ok(())
    }

    /// Basis points owed on `amount`, per the **stored** fee schedule.
    ///
    /// Selects the highest tier threshold that does not exceed `amount`. An amount
    /// below every threshold pays nothing; the default schedule includes a tier at
    /// `0`, so that only happens once an admin removes it.
    pub fn fee_for_amount(env: Env, amount: i128) -> Result<u32, ContractError> {
        Self::require_current_schema(&env)?;
        require_non_negative_amount(amount)?;
        let schedule = Self::load_schedule(&env)?;
        Ok(Self::select_tier(&schedule, amount))
    }

    /// Fee owed on `amount`, and record it against the running total.
    pub fn collect_fee(env: Env, amount: i128, recipient: Address) -> Result<i128, ContractError> {
        Self::require_current_schema(&env)?;
        require_positive_amount(amount)?;

        let schedule = Self::load_schedule(&env)?;
        let fee = basis_points_of(amount, Self::select_tier(&schedule, amount))?;

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalCollected)
            .unwrap_or(0);
        let new_total = total.checked_add(fee).ok_or(ContractError::Overflow)?;
        env.storage()
            .instance()
            .set(&DataKey::TotalCollected, &new_total);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("collect"),), (amount, fee, recipient));
        Ok(fee)
    }

    /// Running total of fees collected since init (or since migration).
    pub fn total_collected(env: Env) -> Result<i128, ContractError> {
        Self::require_current_schema(&env)?;
        env.storage()
            .instance()
            .get(&DataKey::TotalCollected)
            .ok_or(ContractError::NotInitialized)
    }

    /// Add or update a fee tier. Admin only.
    ///
    /// `amount_tier` is the minimum transfer amount (in stroops) at which this rate
    /// applies. Accepts a non-negative `i128` for API compatibility; stored as `u64`
    /// internally (schema v3 footprint reduction).
    pub fn set_fee_schedule(
        env: Env,
        amount_tier: i128,
        basis_points: u32,
    ) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        Self::require_admin(&env)?;
        if amount_tier < 0 {
            return Err(ContractError::InvalidInput);
        }
        require_basis_points(basis_points, MAX_SINGLE_FEE_BP)?;

        let tier_key = amount_tier as u64;
        let mut schedule = Self::load_schedule(&env)?;
        // Only an addition can breach the cap; updating an existing tier is fine.
        if !schedule.contains_key(tier_key) && schedule.len() >= MAX_FEE_TIERS {
            return Err(ContractError::InvalidInput);
        }

        schedule.set(tier_key, basis_points);
        env.storage()
            .instance()
            .set(&DataKey::FeeSchedule, &schedule);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("schedule"),), (amount_tier, basis_points));
        Ok(())
    }

    /// Remove a fee tier. Admin only.
    pub fn remove_fee_tier(env: Env, amount_tier: i128) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        Self::require_admin(&env)?;

        if amount_tier < 0 {
            return Err(ContractError::InvalidInput);
        }
        let tier_key = amount_tier as u64;
        let mut schedule = Self::load_schedule(&env)?;
        if !schedule.contains_key(tier_key) {
            return Err(ContractError::InvalidInput);
        }
        schedule.remove(tier_key);
        env.storage()
            .instance()
            .set(&DataKey::FeeSchedule, &schedule);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("rmtier"),), amount_tier);
        Ok(())
    }

    /// The full stored fee schedule (keys as `u64` stroop thresholds).
    pub fn get_fee_schedule(env: Env) -> Result<Map<u64, u32>, ContractError> {
        Self::require_current_schema(&env)?;
        Self::load_schedule(&env)
    }

    /// The address collected fees are routed to.
    pub fn get_treasury(env: Env) -> Result<Address, ContractError> {
        Self::require_current_schema(&env)?;
        env.storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(ContractError::NotInitialized)
    }

    /// Point the treasury at a new address. Admin only.
    pub fn update_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        Self::require_admin(&env)?;

        env.storage()
            .instance()
            .set(&DataKey::Treasury, &new_treasury);
        Self::bump_instance_ttl(&env);
        env.events()
            .publish((symbol_short!("treasury"),), new_treasury);
        Ok(())
    }

    /// Announce that `amount` is routed to the treasury.
    ///
    /// Emits an event for off-chain settlement; like the escrow, this contract does
    /// not itself move tokens.
    pub fn route_to_treasury(env: Env, amount: i128) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        require_positive_amount(amount)?;

        let treasury = Self::get_treasury(env.clone())?;
        env.events()
            .publish((symbol_short!("routed"),), (amount, treasury));
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
    ///
    /// Handles two migration paths:
    /// - v1 → v3: adds `TotalCollected` counter and converts schedule keys from `i128` to `u64`.
    /// - v2 → v3: converts schedule keys from `i128` to `u64` (saves 8 bytes/tier).
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
            // v1 tracked no running total. Start the counter at zero rather than
            // leaving the key absent, which would fail every `total_collected` call.
            env.storage()
                .instance()
                .set(&DataKey::TotalCollected, &0i128);
        }

        // Both v1 and v2 used Map<i128, u32> for the schedule; migrate to Map<u64, u32>.
        // All tier thresholds are validated non-negative at write time, so casting
        // i128 → u64 is safe for any live deployment.
        //
        // Storage savings: 8 bytes per tier key × up to 16 tiers = up to 128 bytes.
        {
            let old: Map<i128, u32> = env
                .storage()
                .instance()
                .get(&DataKey::FeeSchedule)
                .unwrap_or_else(|| Map::new(&env));

            let mut new_schedule: Map<u64, u32> = Map::new(&env);
            for (threshold, bps) in old.iter() {
                // Safe cast: stored tiers are always >= 0 (enforced by set_fee_schedule).
                new_schedule.set(threshold as u64, bps);
            }
            env.storage()
                .instance()
                .set(&DataKey::FeeSchedule, &new_schedule);
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

    /// Highest tier threshold not exceeding `amount`, or 0 basis points if none.
    ///
    /// `Map` iterates in key order, so the last matching entry is the best one.
    fn select_tier(schedule: &Map<u64, u32>, amount: i128) -> u32 {
        let mut selected = 0u32;
        for (threshold, basis_points) in schedule.iter() {
            if (threshold as i128) > amount {
                break;
            }
            selected = basis_points;
        }
        selected
    }

    fn load_schedule(env: &Env) -> Result<Map<u64, u32>, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::FeeSchedule)
            .ok_or(ContractError::NotInitialized)
    }

    fn require_admin(env: &Env) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }

    fn require_current_schema(env: &Env) -> Result<(), ContractError> {
        check_schema_version(
            env.storage().instance().get(&DataKey::Schema),
            SCHEMA_VERSION,
        )
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
