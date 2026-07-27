//! Treasury unit tests.
//!
//! All setup comes from [`crate::test_utils`] (issue #818).

use stellar_spend_shared::errors::ContractError;

use crate::test_utils::{assert_fresh_init_is_current, TreasuryTest};
use crate::{MAX_FEE_TIERS, MAX_SINGLE_FEE_BP, SCHEMA_VERSION};

// ── Initialisation ───────────────────────────────────────────────────────────

#[test]
fn init_persists_admin_treasury_and_schedule() {
    let t = TreasuryTest::setup();
    assert_fresh_init_is_current(&t);
    assert_eq!(t.client().get_treasury(), t.treasury);
    assert_eq!(t.client().total_collected(), 0);
    assert_eq!(t.client().get_fee_schedule().len(), 3);
}

#[test]
fn init_is_rejected_twice() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client().try_init(&t.outsider, &t.outsider),
        Err(Ok(ContractError::AlreadyInitialized))
    );
}

#[test]
fn entrypoints_reject_an_uninitialised_contract() {
    let t = TreasuryTest::registered();
    assert_eq!(
        t.client().try_get_treasury(),
        Err(Ok(ContractError::NotInitialized)),
        "must not invent a treasury address to route fees to"
    );
    assert_eq!(
        t.client().try_collect_fee(&1_000, &t.outsider),
        Err(Ok(ContractError::NotInitialized))
    );
}

// ── The #815 regression: the stored schedule must actually be read ───────────

#[test]
fn fee_tiers_come_from_storage_not_hard_coded_branches() {
    let t = TreasuryTest::setup();

    // Defaults seeded at init.
    assert_eq!(t.client().fee_for_amount(&500_000), 50);
    assert_eq!(t.client().fee_for_amount(&5_000_000), 25);
    assert_eq!(t.client().fee_for_amount(&50_000_000), 10);

    // Reconfigure every tier. The previous implementation ignored the stored
    // schedule and returned the compiled-in 50/25/10 regardless, which made
    // `set_fee_schedule` a no-op from the caller's point of view.
    t.client().set_fee_schedule(&0, &7);
    t.client().set_fee_schedule(&1_000_000, &6);
    t.client().set_fee_schedule(&10_000_000, &5);

    assert_eq!(t.client().fee_for_amount(&500_000), 7);
    assert_eq!(t.client().fee_for_amount(&5_000_000), 6);
    assert_eq!(t.client().fee_for_amount(&50_000_000), 5);
}

#[test]
fn collect_fee_charges_the_reconfigured_rate() {
    let t = TreasuryTest::setup();
    assert_eq!(t.client().collect_fee(&1_000_000, &t.outsider), 2_500); // 25bp

    t.client().set_fee_schedule(&1_000_000, &100); // 1%
    assert_eq!(t.client().collect_fee(&1_000_000, &t.outsider), 10_000);
}

#[test]
fn a_newly_added_tier_takes_effect() {
    let t = TreasuryTest::setup();
    assert_eq!(t.client().fee_for_amount(&2_000_000), 25);

    t.client().set_fee_schedule(&2_000_000, &15);
    assert_eq!(t.client().fee_for_amount(&2_000_000), 15);
    assert_eq!(
        t.client().fee_for_amount(&1_999_999),
        25,
        "the tier below must be unaffected"
    );
}

#[test]
fn removing_a_tier_falls_back_to_the_one_below() {
    let t = TreasuryTest::setup();
    assert_eq!(t.client().fee_for_amount(&50_000_000), 10);

    t.client().remove_fee_tier(&10_000_000);
    assert_eq!(
        t.client().fee_for_amount(&50_000_000),
        25,
        "a large amount should now pay the 1M tier's rate"
    );
}

#[test]
fn removing_a_missing_tier_is_an_error() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client().try_remove_fee_tier(&999),
        Err(Ok(ContractError::InvalidInput))
    );
}

// ── Tier selection edge cases ────────────────────────────────────────────────

#[test]
fn tier_boundaries_are_inclusive_at_the_threshold() {
    let t = TreasuryTest::setup();
    assert_eq!(t.client().fee_for_amount(&999_999), 50);
    assert_eq!(t.client().fee_for_amount(&1_000_000), 25, "boundary is >=");
    assert_eq!(t.client().fee_for_amount(&9_999_999), 25);
    assert_eq!(t.client().fee_for_amount(&10_000_000), 10);
}

#[test]
fn an_amount_below_every_tier_pays_nothing() {
    let t = TreasuryTest::setup();
    // Drop the zero tier so small amounts fall through the schedule entirely.
    t.client().remove_fee_tier(&0);
    assert_eq!(t.client().fee_for_amount(&500), 0);
    assert_eq!(t.client().collect_fee(&500, &t.outsider), 0);
}

#[test]
fn an_empty_schedule_charges_nothing_rather_than_panicking() {
    let t = TreasuryTest::setup();
    t.force_schedule(&[]);
    assert_eq!(t.client().fee_for_amount(&50_000_000), 0);
    assert_eq!(t.client().collect_fee(&50_000_000, &t.outsider), 0);
}

#[test]
fn unordered_tier_insertion_still_selects_the_highest_match() {
    // Map iteration is key-ordered regardless of insertion order; pin that, because
    // `select_tier` breaks out of the loop on the first threshold above the amount.
    let t = TreasuryTest::setup();
    t.force_schedule(&[(10_000_000, 10), (0, 50), (1_000_000, 25)]);
    assert_eq!(t.client().fee_for_amount(&50_000_000), 10);
    assert_eq!(t.client().fee_for_amount(&5_000_000), 25);
    assert_eq!(t.client().fee_for_amount(&5), 50);
}

// ── Validation (issue #816) ──────────────────────────────────────────────────

#[test]
fn collect_fee_rejects_non_positive_amounts() {
    let t = TreasuryTest::setup();
    for bad in [0i128, -1, i128::MIN] {
        assert_eq!(
            t.client().try_collect_fee(&bad, &t.outsider),
            Err(Ok(ContractError::InvalidAmount)),
            "amount {bad} must be rejected"
        );
    }
}

#[test]
fn fee_for_amount_rejects_a_negative_amount() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client().try_fee_for_amount(&-1),
        Err(Ok(ContractError::InvalidAmount))
    );
    assert_eq!(t.client().fee_for_amount(&0), 50, "zero is a valid query");
}

#[test]
fn set_fee_schedule_enforces_the_per_tier_cap() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client()
            .try_set_fee_schedule(&0, &(MAX_SINGLE_FEE_BP + 1)),
        Err(Ok(ContractError::InvalidInput))
    );
    assert!(t
        .client()
        .try_set_fee_schedule(&0, &MAX_SINGLE_FEE_BP)
        .is_ok());
}

#[test]
fn set_fee_schedule_rejects_a_negative_tier() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client().try_set_fee_schedule(&-1, &50),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn set_fee_schedule_caps_the_number_of_tiers() {
    let t = TreasuryTest::setup();
    // Three tiers already exist; fill to the ceiling.
    for i in 3..MAX_FEE_TIERS {
        t.client().set_fee_schedule(&(i as i128 * 100_000_000), &10);
    }
    assert_eq!(t.client().get_fee_schedule().len(), MAX_FEE_TIERS);

    assert_eq!(
        t.client().try_set_fee_schedule(&9_999_999_999, &10),
        Err(Ok(ContractError::InvalidInput)),
        "an unbounded schedule is a metering hazard for the linear scan"
    );

    // Updating an existing tier must still be allowed at the ceiling.
    assert!(t.client().try_set_fee_schedule(&0, &40).is_ok());
}

#[test]
fn route_to_treasury_rejects_non_positive_amounts() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client().try_route_to_treasury(&0),
        Err(Ok(ContractError::InvalidAmount))
    );
    assert!(t.client().try_route_to_treasury(&1).is_ok());
}

// ── Running total ────────────────────────────────────────────────────────────

#[test]
fn total_collected_accumulates_across_calls() {
    let t = TreasuryTest::setup();
    assert_eq!(t.client().total_collected(), 0);

    let first = t.client().collect_fee(&1_000_000, &t.outsider); // 2_500
    let second = t.client().collect_fee(&10_000_000, &t.outsider); // 10_000

    assert_eq!(t.client().total_collected(), first + second);
}

#[test]
fn collect_fee_reports_overflow_rather_than_wrapping() {
    let t = TreasuryTest::setup();
    t.force_schedule(&[(0, 10_000)]); // 100%, so fee == amount
    assert_eq!(
        t.client().try_collect_fee(&i128::MAX, &t.outsider),
        Err(Ok(ContractError::Overflow))
    );
}

// ── Treasury address ─────────────────────────────────────────────────────────

#[test]
fn update_treasury_changes_the_routing_target() {
    let t = TreasuryTest::setup();
    t.client().update_treasury(&t.outsider);
    assert_eq!(t.client().get_treasury(), t.outsider);
}

#[test]
fn schema_version_matches_the_constant() {
    let t = TreasuryTest::setup();
    assert_eq!(t.client().schema_version(), SCHEMA_VERSION);
}
