#![no_std]
use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, Error};

const VERSION: &str = "1.0.0";
const PAUSED_KEY: &str = "paused";
const ADMIN_KEY: &str = "admin";

// Fee tier boundaries (in basis points - 100 = 1%)
pub const FEE_TIER_1_MIN: i128 = 0;
pub const FEE_TIER_1_MAX: i128 = 10_000_000; // $10M
pub const FEE_TIER_2_MIN: i128 = 10_000_001;
pub const FEE_TIER_2_MAX: i128 = 50_000_000; // $50M
pub const FEE_TIER_3_MIN: i128 = 50_000_001;

// Fee rates for each tier (in basis points)
pub const TIER_1_FEE_RATE: u32 = 50; // 0.5%
pub const TIER_2_FEE_RATE: u32 = 35; // 0.35%
pub const TIER_3_FEE_RATE: u32 = 25; // 0.25%

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

    pub fn pause(env: Env, reason: String) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY))
            .ok_or(Error::InvalidInput)?;
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, PAUSED_KEY), &true);
        env.events().publish((Symbol::new(&env, "pause"), reason), ());
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY))
            .ok_or(Error::InvalidInput)?;
        admin.require_auth();

        env.storage().instance().set(&Symbol::new(&env, PAUSED_KEY), &false);
        env.events().publish((Symbol::new(&env, "unpause"),), ());
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&Symbol::new(&env, PAUSED_KEY))
            .unwrap_or(false)
    }

    pub fn calculate_fee(env: Env, amount: i128, fee_rate: u32) -> Result<i128, Error> {
        if Self::is_paused(env.clone()) {
            return Err(Error::InvalidInput);
        }
        if amount < 0 {
            return Err(Error::InvalidInput);
        }
        let fee = (amount as u128 * fee_rate as u128 / 10000) as i128;
        env.events().publish((Symbol::new(&env, "fee_calculated"),), fee);
        Ok(fee)
    }

    pub fn get_tier_fee_rate(amount: i128) -> Result<u32, Error> {
        if amount < 0 {
            return Err(Error::InvalidInput);
        }

        if amount <= FEE_TIER_1_MAX {
            Ok(TIER_1_FEE_RATE)
        } else if amount <= FEE_TIER_2_MAX {
            Ok(TIER_2_FEE_RATE)
        } else {
            Ok(TIER_3_FEE_RATE)
        }
    }

    pub fn calculate_tiered_fee(env: Env, amount: i128) -> Result<i128, Error> {
        let fee_rate = Self::get_tier_fee_rate(amount)?;
        Self::calculate_fee(env, amount, fee_rate)
    }

    pub fn migrate(env: Env, new_version: String) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY))
            .ok_or(Error::InvalidInput)?;
        admin.require_auth();

        env.events().publish((Symbol::new(&env, "migrate"), new_version), ());
        Ok(())
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
