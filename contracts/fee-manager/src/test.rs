//! Fee-manager unit tests.
//!
//! All setup comes from [`crate::test_utils`] (issue #818).

use stellar_spend_shared::{errors::ContractError, validation::MAX_BASIS_POINTS};

use crate::test_utils::{assert_fresh_init_is_current, FeeManagerTest, DEFAULT_TEST_FEE_BP};
use crate::{MAX_DEFAULT_FEE_BP, SCHEMA_VERSION};

// ── Initialisation ───────────────────────────────────────────────────────────

#[test]
fn init_persists_admin_rate_and_schema() {
    let t = FeeManagerTest::setup();
    assert_fresh_init_is_current(&t);
    assert_eq!(t.client().default_rate(), DEFAULT_TEST_FEE_BP);
    assert!(!t.client().is_paused());
}

#[test]
fn init_is_rejected_twice() {
    let t = FeeManagerTest::setup();
    assert_eq!(
        t.client().try_init(&t.outsider, &10),
        Err(Ok(ContractError::AlreadyInitialized))
    );
}

#[test]
fn init_rejects_a_rate_above_the_cap() {
    let t = FeeManagerTest::registered();
    assert_eq!(
        t.client().try_init(&t.admin, &(MAX_DEFAULT_FEE_BP + 1)),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn is_paused_is_false_for_an_uninitialised_contract() {
    // Deliberately not an error: callers use this as a cheap pre-flight guard.
    let t = FeeManagerTest::registered();
    assert!(!t.client().is_paused());
}

// ── Fee arithmetic (issue #816) ──────────────────────────────────────────────

#[test]
fn calculate_fee_applies_basis_points() {
    let t = FeeManagerTest::setup();
    assert_eq!(t.client().calculate_fee(&1_000_000, &50), 5_000); // 0.5%
    assert_eq!(t.client().calculate_fee(&1_000_000, &0), 0);
    assert_eq!(t.client().calculate_fee(&1_000_000, &10_000), 1_000_000); // 100%
}

#[test]
fn calculate_fee_rejects_non_positive_amounts() {
    let t = FeeManagerTest::setup();
    // The previous implementation cast `amount as u128`, so a negative amount
    // wrapped to an enormous positive fee instead of being rejected.
    for bad in [0i128, -1, -1_000_000, i128::MIN] {
        assert_eq!(
            t.client().try_calculate_fee(&bad, &50),
            Err(Ok(ContractError::InvalidAmount)),
            "amount {bad} must be rejected"
        );
    }
}

#[test]
fn calculate_fee_rejects_a_rate_above_one_hundred_percent() {
    let t = FeeManagerTest::setup();
    assert_eq!(
        t.client()
            .try_calculate_fee(&1_000, &(MAX_BASIS_POINTS + 1)),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn calculate_fee_reports_overflow_rather_than_wrapping() {
    let t = FeeManagerTest::setup();
    assert_eq!(
        t.client().try_calculate_fee(&i128::MAX, &10_000),
        Err(Ok(ContractError::Overflow))
    );
}

#[test]
fn calculate_fee_truncates_toward_zero() {
    let t = FeeManagerTest::setup();
    // 1 * 1bp = 0.0001, which floors to 0 — the contract must not round up and
    // charge a fee larger than the amount warrants.
    assert_eq!(t.client().calculate_fee(&1, &1), 0);
    assert_eq!(t.client().calculate_fee(&9_999, &1), 0);
    assert_eq!(t.client().calculate_fee(&10_000, &1), 1);
}

#[test]
fn calculate_default_fee_uses_the_configured_rate() {
    let t = FeeManagerTest::setup();
    assert_eq!(t.client().calculate_default_fee(&1_000_000), 5_000);

    t.client().set_default_rate(&100); // 1%
    assert_eq!(t.client().calculate_default_fee(&1_000_000), 10_000);
}

#[test]
fn set_default_rate_enforces_the_cap() {
    let t = FeeManagerTest::setup();
    assert_eq!(
        t.client().try_set_default_rate(&(MAX_DEFAULT_FEE_BP + 1)),
        Err(Ok(ContractError::InvalidInput))
    );
    assert!(t.client().try_set_default_rate(&MAX_DEFAULT_FEE_BP).is_ok());
}

// ── Circuit breaker ──────────────────────────────────────────────────────────

#[test]
fn pause_blocks_fee_calculation() {
    let t = FeeManagerTest::setup_paused();
    assert!(t.client().is_paused());
    assert_eq!(
        t.client().try_calculate_fee(&1_000, &50),
        Err(Ok(ContractError::Paused))
    );
    assert_eq!(
        t.client().try_calculate_default_fee(&1_000),
        Err(Ok(ContractError::Paused))
    );
}

#[test]
fn unpause_restores_service() {
    let t = FeeManagerTest::setup_paused();
    t.client().unpause();
    assert!(!t.client().is_paused());
    assert_eq!(t.client().calculate_fee(&1_000_000, &50), 5_000);
}

#[test]
fn pause_and_unpause_are_not_idempotent_no_ops() {
    let t = FeeManagerTest::setup();

    // Unpausing a running contract is a caller mistake worth surfacing, not a no-op
    // that hides a broken incident-response script.
    assert_eq!(
        t.client().try_unpause(),
        Err(Ok(ContractError::InvalidInput))
    );

    t.client().pause(&t.reason("incident"));
    assert_eq!(
        t.client().try_pause(&t.reason("incident again")),
        Err(Ok(ContractError::Paused))
    );
}

#[test]
fn pause_rejects_an_empty_or_oversized_reason() {
    let t = FeeManagerTest::setup();
    assert_eq!(
        t.client().try_pause(&t.reason("")),
        Err(Ok(ContractError::InvalidInput))
    );

    let long = "x".repeat(129);
    assert_eq!(
        t.client().try_pause(&t.reason(&long)),
        Err(Ok(ContractError::InvalidInput)),
        "reasons are echoed into event topics and must stay bounded"
    );
}

// ── Version metadata ─────────────────────────────────────────────────────────

#[test]
fn version_is_reported() {
    let t = FeeManagerTest::setup();
    assert_eq!(t.client().version(), t.reason("1.0.0"));
}

#[test]
fn schema_version_matches_the_constant() {
    let t = FeeManagerTest::setup();
    assert_eq!(t.client().schema_version(), SCHEMA_VERSION);
}
