//! Fee-manager contract for Stellar-Spend.
//!
//! ## Changes (issue #810)
//! - `overflow-checks = true` is now set in `Cargo.toml` for the release
//!   profile so the Rust compiler will trap on overflow in release builds.
//! - `calculate_fee` replaces the raw `as i128` cast with `checked_mul` /
//!   `checked_div`, returning `ContractError::Overflow` instead of panicking
//!   or silently wrapping.
//!
//! ## Changes (issue #808)
//! - All error paths use [`ContractError`] from `stellar-spend-shared`.

#![no_std]
use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, String};
use stellar_spend_shared::errors::ContractError;

const VERSION: &str = "1.0.0";
const PAUSED_KEY: &str = "paused";
const ADMIN_KEY: &str = "admin";

/// Basis-point denominator: fee_rate is expressed in hundredths of a percent.
const BASIS_POINT_DENOM: u128 = 10_000;

#[contract]
pub struct FeeManagerContract;

#[contractimpl]
impl FeeManagerContract {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&Symbol::new(&env, ADMIN_KEY), &admin);
        env.storage().instance().set(&Symbol::new(&env, PAUSED_KEY), &false);
    }

    pub fn version(env: Env) -> String {
        String::from_slice(&env, VERSION.as_bytes())
    }

    pub fn pause(env: Env, reason: String) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .ok_or(ContractError::NotFound)?;
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, PAUSED_KEY), &true);
        env.events().publish((Symbol::new(&env, "pause"), reason), ());
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .ok_or(ContractError::NotFound)?;
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, PAUSED_KEY), &false);
        env.events().publish((Symbol::new(&env, "unpause"),), ());
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, PAUSED_KEY))
            .unwrap_or(false)
    }

    /// Compute `floor(amount * fee_rate / 10_000)`.
    ///
    /// ### Overflow safety
    /// - `amount` is cast to `u128` (it must be > 0, so no sign issue).
    /// - `checked_mul` / `checked_div` are used for every arithmetic step.
    /// - If either intermediate value overflows `u128`, the function returns
    ///   `ContractError::Overflow` instead of panicking or wrapping.
    /// - The final `u128 → i128` cast is safe because:
    ///   `fee ≤ amount ≤ i128::MAX` (amount is a valid positive i128).
    ///
    /// ### Paused guard
    /// Returns `ContractError::Paused` when the contract is paused.
    pub fn calculate_fee(
        env: Env,
        amount: i128,
        fee_rate: u32,
    ) -> Result<i128, ContractError> {
        if Self::is_paused(env.clone()) {
            return Err(ContractError::Paused);
        }

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let fee = Self::compute_fee(amount, fee_rate)?;

        env.events().publish((Symbol::new(&env, "fee_calculated"),), fee);
        Ok(fee)
    }

    pub fn migrate(env: Env, new_version: String) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .ok_or(ContractError::NotFound)?;
        admin.require_auth();

        env.events().publish((Symbol::new(&env, "migrate"), new_version), ());
        Ok(())
    }

    // ── Overflow-safe fee arithmetic (pub(crate) for testing) ──────────────────

    pub(crate) fn compute_fee(amount: i128, fee_rate: u32) -> Result<i128, ContractError> {
        // amount is guaranteed positive at this point (caller checked)
        let amount_u128 = amount as u128;

        let numerator = amount_u128
            .checked_mul(fee_rate as u128)
            .ok_or(ContractError::Overflow)?;

        let fee_u128 = numerator
            .checked_div(BASIS_POINT_DENOM)
            .ok_or(ContractError::Overflow)?;

        // Safe: fee_u128 ≤ amount_u128 ≤ i128::MAX because amount was i128
        Ok(fee_u128 as i128)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use stellar_spend_shared::errors::ContractError;

    // ── Normal operation ──────────────────────────────────────────────────────

    #[test]
    fn test_fee_50bp_of_100() {
        // 0.5% of 100 = 0 (floor: 100*50/10000 = 0)
        let fee = FeeManagerContract::compute_fee(100, 50).unwrap();
        assert_eq!(fee, 0);
    }

    #[test]
    fn test_fee_50bp_of_1_000_000() {
        // 0.5% of 1_000_000 = 5_000
        let fee = FeeManagerContract::compute_fee(1_000_000, 50).unwrap();
        assert_eq!(fee, 5_000);
    }

    #[test]
    fn test_fee_100bp_of_1_000_000() {
        // 1% of 1_000_000 = 10_000
        let fee = FeeManagerContract::compute_fee(1_000_000, 100).unwrap();
        assert_eq!(fee, 10_000);
    }

    #[test]
    fn test_fee_10000bp_of_1() {
        // 100% of 1 = 1
        let fee = FeeManagerContract::compute_fee(1, 10_000).unwrap();
        assert_eq!(fee, 1);
    }

    #[test]
    fn test_fee_zero_rate() {
        // 0% fee → always 0
        let fee = FeeManagerContract::compute_fee(1_000_000_000, 0).unwrap();
        assert_eq!(fee, 0);
    }

    // ── Boundary / overflow tests ─────────────────────────────────────────────

    /// Old code: `(amount as u128 * fee_rate as u128 / 10000) as i128`
    /// If `amount = i128::MAX` and `fee_rate = 10_000`, then
    /// `i128::MAX as u128 * 10_000` overflows u128.
    /// With checked_mul this returns Overflow instead of panicking/wrapping.
    #[test]
    fn test_overflow_max_amount_max_rate() {
        let result = FeeManagerContract::compute_fee(i128::MAX, 10_000);
        assert_eq!(
            result.unwrap_err(),
            ContractError::Overflow,
            "i128::MAX * 10_000 must overflow u128 and return ContractError::Overflow"
        );
    }

    /// Large but safe value: i128::MAX / 10_001 * 10_000 fits in u128.
    #[test]
    fn test_large_safe_amount_does_not_overflow() {
        // amount = 1_000_000_000_000 (1 trillion stroops), rate = 10_000 (100%)
        // 1e12 * 10_000 = 1e16, which is well within u128::MAX
        let fee = FeeManagerContract::compute_fee(1_000_000_000_000, 10_000).unwrap();
        assert_eq!(fee, 1_000_000_000_000, "100% fee of 1e12 = 1e12");
    }

    #[test]
    fn test_min_nonzero_fee() {
        // Minimum non-zero fee: amount = 10_000, rate = 1 (0.01%) → fee = 1
        let fee = FeeManagerContract::compute_fee(10_000, 1).unwrap();
        assert_eq!(fee, 1);
    }

    #[test]
    fn test_fee_floor_division() {
        // 9_999 * 50 / 10_000 = 499950 / 10000 = 49 (floor, not 50)
        let fee = FeeManagerContract::compute_fee(9_999, 50).unwrap();
        assert_eq!(fee, 49);
    }

    // ── Paused guard ──────────────────────────────────────────────────────────

    /// Paused state is checked using shared ContractError::Paused
    #[test]
    fn test_paused_error_variant() {
        let err = ContractError::Paused;
        assert_eq!(err as u32, 7, "ContractError::Paused must have stable code 7");
    }

    // ── Overflow error code stability ─────────────────────────────────────────

    #[test]
    fn test_overflow_error_code_is_stable() {
        assert_eq!(ContractError::Overflow as u32, 9,
            "ContractError::Overflow must have stable code 9");
    }
}
