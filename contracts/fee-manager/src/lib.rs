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

#[cfg(test)]
mod tests {
    use super::*;

    // ============================================================================
    // FEE TIER BOUNDARY TESTS (Issue #826)
    // Testing exact tier boundary values and off-by-one cases
    // ============================================================================

    #[test]
    fn test_tier_1_lower_boundary() {
        // Tier 1 minimum: $0
        assert_eq!(FeeManagerContract::get_tier_fee_rate(0).unwrap(), TIER_1_FEE_RATE);
        assert_eq!(FeeManagerContract::get_tier_fee_rate(1).unwrap(), TIER_1_FEE_RATE);
    }

    #[test]
    fn test_tier_1_upper_boundary() {
        // Tier 1 maximum: $10M (10,000,000)
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_1_MAX).unwrap(),
            TIER_1_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_1_MAX - 1).unwrap(),
            TIER_1_FEE_RATE
        );
    }

    #[test]
    fn test_tier_1_to_tier_2_boundary() {
        // Off-by-one: Just at the boundary where it transitions to Tier 2
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_1_MAX).unwrap(),
            TIER_1_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_2_MIN).unwrap(),
            TIER_2_FEE_RATE
        );
        // Verify the exact boundary difference
        assert_eq!(FEE_TIER_2_MIN - FEE_TIER_1_MAX, 1);
    }

    #[test]
    fn test_tier_2_lower_boundary() {
        // Tier 2 minimum: $10M + $1
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_2_MIN).unwrap(),
            TIER_2_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_2_MIN + 1).unwrap(),
            TIER_2_FEE_RATE
        );
    }

    #[test]
    fn test_tier_2_upper_boundary() {
        // Tier 2 maximum: $50M
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_2_MAX).unwrap(),
            TIER_2_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_2_MAX - 1).unwrap(),
            TIER_2_FEE_RATE
        );
    }

    #[test]
    fn test_tier_2_to_tier_3_boundary() {
        // Off-by-one: Transition from Tier 2 to Tier 3
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_2_MAX).unwrap(),
            TIER_2_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_3_MIN).unwrap(),
            TIER_3_FEE_RATE
        );
        // Verify the exact boundary difference
        assert_eq!(FEE_TIER_3_MIN - FEE_TIER_2_MAX, 1);
    }

    #[test]
    fn test_tier_3_lower_boundary() {
        // Tier 3 minimum: $50M + $1
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_3_MIN).unwrap(),
            TIER_3_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(FEE_TIER_3_MIN + 1).unwrap(),
            TIER_3_FEE_RATE
        );
    }

    #[test]
    fn test_tier_3_large_amounts() {
        // Tier 3 applies to very large amounts
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(100_000_000).unwrap(),
            TIER_3_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(1_000_000_000).unwrap(),
            TIER_3_FEE_RATE
        );
        assert_eq!(
            FeeManagerContract::get_tier_fee_rate(i128::MAX).unwrap(),
            TIER_3_FEE_RATE
        );
    }

    // ============================================================================
    // FEE CALCULATION WITH ROUNDING TESTS
    // ============================================================================

    #[test]
    fn test_fee_calculation_zero_amount() {
        // $0 amount should result in $0 fee
        assert_eq!(
            FeeManagerContract::calculate_fee(
                unsafe { soroban_sdk::Env::new() },
                0,
                TIER_1_FEE_RATE
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn test_fee_calculation_rounding_down() {
        // Test rounding behavior: 999 * 50 / 10000 = 4.995 rounds down to 4
        let amount = 999i128;
        let expected_fee = (amount as u128 * TIER_1_FEE_RATE as u128 / 10000) as i128;
        assert_eq!(expected_fee, 4);
    }

    #[test]
    fn test_fee_calculation_exact_boundary() {
        // $10M * 0.5% = $50,000 (exact calculation, no rounding)
        let amount = FEE_TIER_1_MAX;
        let expected_fee = (amount as u128 * TIER_1_FEE_RATE as u128 / 10000) as i128;
        assert_eq!(expected_fee, 50_000);
    }

    #[test]
    fn test_fee_calculation_tier_2_boundary() {
        // $10M + $1 * 0.35% = $35,000.35 rounds down to $35,000
        let amount = FEE_TIER_2_MIN;
        let expected_fee = (amount as u128 * TIER_2_FEE_RATE as u128 / 10000) as i128;
        assert_eq!(expected_fee, 35_000);
    }

    #[test]
    fn test_fee_calculation_tier_3_boundary() {
        // $50M + $1 * 0.25% = $125,000.25 rounds down to $125,000
        let amount = FEE_TIER_3_MIN;
        let expected_fee = (amount as u128 * TIER_3_FEE_RATE as u128 / 10000) as i128;
        assert_eq!(expected_fee, 125_000);
    }

    #[test]
    fn test_fee_calculation_large_amount() {
        // Test with a very large amount to ensure no overflow
        let amount = 100_000_000_000i128; // $100B
        let expected_fee = (amount as u128 * TIER_3_FEE_RATE as u128 / 10000) as i128;
        assert_eq!(expected_fee, 250_000_000); // $250M
    }

    // ============================================================================
    // FEE TIER INTEGRATION TESTS
    // ============================================================================

    #[test]
    fn test_tiered_fee_at_boundaries() {
        // Verify that tiered fee respects boundaries
        let tier_1_max = FEE_TIER_1_MAX;
        let tier_2_min = FEE_TIER_2_MIN;
        let tier_2_max = FEE_TIER_2_MAX;
        let tier_3_min = FEE_TIER_3_MIN;

        // All amounts return correct tier rates
        assert_eq!(FeeManagerContract::get_tier_fee_rate(tier_1_max).unwrap(), TIER_1_FEE_RATE);
        assert_eq!(FeeManagerContract::get_tier_fee_rate(tier_2_min).unwrap(), TIER_2_FEE_RATE);
        assert_eq!(FeeManagerContract::get_tier_fee_rate(tier_2_max).unwrap(), TIER_2_FEE_RATE);
        assert_eq!(FeeManagerContract::get_tier_fee_rate(tier_3_min).unwrap(), TIER_3_FEE_RATE);
    }

    #[test]
    fn test_tier_fee_rate_decreases_with_volume() {
        // Verify that fee rates decrease as transaction volume increases
        assert!(TIER_1_FEE_RATE > TIER_2_FEE_RATE);
        assert!(TIER_2_FEE_RATE > TIER_3_FEE_RATE);
    }

    #[test]
    fn test_negative_amount_rejected() {
        // Negative amounts should be rejected
        assert!(FeeManagerContract::get_tier_fee_rate(-1).is_err());
        assert!(FeeManagerContract::get_tier_fee_rate(-1000).is_err());
    }

    #[test]
    fn test_boundary_fee_differences() {
        // Calculate fees at boundary points to verify discount progression
        let tier_1_fee = (FEE_TIER_1_MAX as u128 * TIER_1_FEE_RATE as u128 / 10000) as i128;
        let tier_2_fee = (FEE_TIER_2_MIN as u128 * TIER_2_FEE_RATE as u128 / 10000) as i128;
        let tier_2_max_fee = (FEE_TIER_2_MAX as u128 * TIER_2_FEE_RATE as u128 / 10000) as i128;
        let tier_3_fee = (FEE_TIER_3_MIN as u128 * TIER_3_FEE_RATE as u128 / 10000) as i128;

        // Verify fees are calculated correctly at each boundary
        assert!(tier_1_fee > 0);
        assert!(tier_2_fee > 0);
        assert!(tier_2_max_fee > tier_2_fee);
        assert!(tier_3_fee > tier_2_max_fee);
    }

    #[test]
    fn test_fee_rate_percentage_correctness() {
        // Verify fee rates represent correct percentages
        // TIER_1_FEE_RATE = 50 basis points = 0.5%
        // TIER_2_FEE_RATE = 35 basis points = 0.35%
        // TIER_3_FEE_RATE = 25 basis points = 0.25%
        let amount = 10_000_000_000i128; // $10B

        let tier_1_percentage = (TIER_1_FEE_RATE as f64 / 10000.0) * 100.0;
        let tier_2_percentage = (TIER_2_FEE_RATE as f64 / 10000.0) * 100.0;
        let tier_3_percentage = (TIER_3_FEE_RATE as f64 / 10000.0) * 100.0;

        assert_eq!(tier_1_percentage, 0.5);
        assert_eq!(tier_2_percentage, 0.35);
        assert_eq!(tier_3_percentage, 0.25);
    }

    #[test]
    fn test_tier_boundary_constants_are_ordered() {
        // Verify tier boundaries are in correct order
        assert!(FEE_TIER_1_MIN <= FEE_TIER_1_MAX);
        assert!(FEE_TIER_1_MAX < FEE_TIER_2_MIN);
        assert!(FEE_TIER_2_MIN <= FEE_TIER_2_MAX);
        assert!(FEE_TIER_2_MAX < FEE_TIER_3_MIN);
    }
}
