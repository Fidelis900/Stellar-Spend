//! Treasury storage schema upgrade safety tests (issue #817).
//!
//! The v1 → v2 change adds the `TotalCollected` counter. The load-bearing assertion
//! is that the **fee schedule survives untouched**: an upgrade that silently reset
//! tiers to the compiled-in defaults would start charging every subsequent transfer
//! at the wrong rate, with nothing in the contract to signal it.

use stellar_spend_shared::errors::ContractError;
use treasury::test_utils::TreasuryTest;
use treasury::SCHEMA_VERSION;

// ── Pre-conditions ───────────────────────────────────────────────────────────

#[test]
fn seeded_state_is_missing_the_key_added_in_v2() {
    let t = TreasuryTest::with_legacy_v1_state();
    assert_eq!(t.stored_schema(), Some(1));
    assert!(
        !t.has_total_collected_key(),
        "the v1 fixture must genuinely lack the key, not hold a zero"
    );
}

#[test]
fn entrypoints_refuse_to_run_against_un_migrated_state() {
    let t = TreasuryTest::with_legacy_v1_state();

    assert_eq!(
        t.client().try_collect_fee(&1_000, &t.outsider),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_fee_for_amount(&1_000),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_total_collected(),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_get_treasury(),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_set_fee_schedule(&0, &25),
        Err(Ok(ContractError::MigrationRequired))
    );
}

// ── The migration ────────────────────────────────────────────────────────────

#[test]
fn migrate_backfills_the_running_total() {
    let t = TreasuryTest::with_legacy_v1_state();

    assert_eq!(t.client().migrate(), 1);
    assert_eq!(t.stored_schema(), Some(SCHEMA_VERSION));
    assert!(t.has_total_collected_key());
    assert_eq!(t.client().total_collected(), 0);
}

#[test]
fn migration_preserves_a_customised_fee_schedule() {
    // The critical case: an operator who had tuned their tiers must not silently
    // revert to the compiled-in 50/25/10 defaults across an upgrade.
    let t = TreasuryTest::registered();
    t.seed_v1_state(&[(0, 7), (500_000, 6), (25_000_000, 5)]);

    t.client().migrate();

    let schedule = t.client().get_fee_schedule();
    assert_eq!(schedule.len(), 3);
    assert_eq!(schedule.get(0), Some(7));
    assert_eq!(schedule.get(500_000), Some(6));
    assert_eq!(schedule.get(25_000_000), Some(5));

    // Default tier thresholds from `init` must not have reappeared.
    assert_eq!(schedule.get(1_000_000), None);
    assert_eq!(schedule.get(10_000_000), None);

    // And the customised rates are what actually get charged.
    assert_eq!(t.client().fee_for_amount(&100_000), 7);
    assert_eq!(t.client().fee_for_amount(&600_000), 6);
    assert_eq!(t.client().fee_for_amount(&30_000_000), 5);
}

#[test]
fn migration_preserves_the_treasury_address() {
    let t = TreasuryTest::with_legacy_v1_state();
    t.client().migrate();
    assert_eq!(t.client().get_treasury(), t.treasury);
}

#[test]
fn contract_is_fully_operational_after_migration() {
    let t = TreasuryTest::with_legacy_v1_state();
    t.client().migrate();

    assert_eq!(t.client().collect_fee(&1_000_000, &t.outsider), 2_500);
    assert_eq!(t.client().total_collected(), 2_500);

    t.client().set_fee_schedule(&1_000_000, &100);
    assert_eq!(t.client().collect_fee(&1_000_000, &t.outsider), 10_000);
    assert_eq!(t.client().total_collected(), 12_500);
}

// ── Guards ───────────────────────────────────────────────────────────────────

#[test]
fn migrate_is_rejected_when_already_current() {
    let t = TreasuryTest::setup();
    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::SchemaAlreadyCurrent))
    );
}

#[test]
fn migrate_is_not_repeatable_and_does_not_reset_the_total() {
    let t = TreasuryTest::with_legacy_v1_state();
    t.client().migrate();
    t.client().collect_fee(&1_000_000, &t.outsider);
    let total = t.client().total_collected();
    assert!(total > 0);

    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::SchemaAlreadyCurrent))
    );
    assert_eq!(
        t.client().total_collected(),
        total,
        "a second migrate must not zero an accumulated total"
    );
}

#[test]
fn migrate_rejects_state_from_a_future_build() {
    let t = TreasuryTest::setup();
    t.env.as_contract(&t.contract_id, || {
        t.env
            .storage()
            .instance()
            .set(&treasury::DataKey::Schema, &(SCHEMA_VERSION + 1));
    });

    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::SchemaVersionUnsupported))
    );
    assert_eq!(
        t.client().try_total_collected(),
        Err(Ok(ContractError::SchemaVersionUnsupported))
    );
}

#[test]
fn migrate_on_an_uninitialised_contract_reports_not_initialised() {
    let t = TreasuryTest::registered();
    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::NotInitialized))
    );
}
