//! Fee-manager storage schema upgrade safety tests (issue #817).
//!
//! The v1 → v2 change here is an *added key* rather than a changed struct: v1 had no
//! `DefaultRate` entry. That is the quieter of the two upgrade hazards — nothing
//! fails to decode, the new build simply reads `None` and every rate-dependent call
//! starts erroring after the WASM swap. These tests pin that the migration backfills
//! the key and that the pre-existing pause state survives.

use fee_manager::test_utils::FeeManagerTest;
use fee_manager::{MIGRATED_DEFAULT_FEE_BP, SCHEMA_VERSION};
use stellar_spend_shared::errors::ContractError;

// ── Pre-conditions ───────────────────────────────────────────────────────────

#[test]
fn seeded_state_is_missing_the_key_added_in_v2() {
    let t = FeeManagerTest::with_legacy_v1_state();
    assert_eq!(t.stored_schema(), Some(1));
    assert!(
        !t.has_default_rate_key(),
        "the v1 fixture must genuinely lack the key, not hold a zero"
    );
}

#[test]
fn entrypoints_refuse_to_run_against_un_migrated_state() {
    let t = FeeManagerTest::with_legacy_v1_state();

    assert_eq!(
        t.client().try_default_rate(),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_calculate_fee(&1_000, &50),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_set_default_rate(&25),
        Err(Ok(ContractError::MigrationRequired))
    );
    assert_eq!(
        t.client().try_pause(&t.reason("incident")),
        Err(Ok(ContractError::MigrationRequired))
    );
}

// ── The migration ────────────────────────────────────────────────────────────

#[test]
fn migrate_backfills_the_missing_rate() {
    let t = FeeManagerTest::with_legacy_v1_state();

    assert_eq!(t.client().migrate(), 1);
    assert_eq!(t.stored_schema(), Some(SCHEMA_VERSION));
    assert!(t.has_default_rate_key());
    assert_eq!(t.client().default_rate(), MIGRATED_DEFAULT_FEE_BP);
}

#[test]
fn contract_is_fully_operational_after_migration() {
    let t = FeeManagerTest::with_legacy_v1_state();
    t.client().migrate();

    assert_eq!(t.client().calculate_fee(&1_000_000, &50), 5_000);
    assert_eq!(
        t.client().calculate_default_fee(&1_000_000),
        (1_000_000 * MIGRATED_DEFAULT_FEE_BP as i128) / 10_000
    );

    t.client().set_default_rate(&100);
    assert_eq!(t.client().default_rate(), 100);
}

#[test]
fn migration_preserves_a_tripped_circuit_breaker() {
    // A contract paused during an incident must not silently resume serving fees
    // just because it was upgraded mid-incident.
    let t = FeeManagerTest::registered();
    t.seed_v1_state(true);

    t.client().migrate();

    assert!(
        t.client().is_paused(),
        "pause state must survive the upgrade"
    );
    assert_eq!(
        t.client().try_calculate_fee(&1_000, &50),
        Err(Ok(ContractError::Paused))
    );

    // And it can still be cleared normally afterwards.
    t.client().unpause();
    assert_eq!(t.client().calculate_fee(&1_000_000, &50), 5_000);
}

#[test]
fn migration_preserves_an_un_paused_contract() {
    let t = FeeManagerTest::registered();
    t.seed_v1_state(false);
    t.client().migrate();
    assert!(!t.client().is_paused());
}

// ── Guards ───────────────────────────────────────────────────────────────────

#[test]
fn migrate_is_rejected_when_already_current() {
    let t = FeeManagerTest::setup();
    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::SchemaAlreadyCurrent))
    );
}

#[test]
fn migrate_is_not_repeatable() {
    let t = FeeManagerTest::with_legacy_v1_state();
    t.client().migrate();
    t.client().set_default_rate(&123);

    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::SchemaAlreadyCurrent))
    );
    assert_eq!(
        t.client().default_rate(),
        123,
        "a second migrate must not reset an operator-configured rate"
    );
}

#[test]
fn migrate_rejects_state_from_a_future_build() {
    let t = FeeManagerTest::setup();
    t.env.as_contract(&t.contract_id, || {
        t.env
            .storage()
            .instance()
            .set(&fee_manager::DataKey::Schema, &(SCHEMA_VERSION + 1));
    });

    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::SchemaVersionUnsupported))
    );
    assert_eq!(
        t.client().try_default_rate(),
        Err(Ok(ContractError::SchemaVersionUnsupported))
    );
}

#[test]
fn migrate_on_an_uninitialised_contract_reports_not_initialised() {
    let t = FeeManagerTest::registered();
    assert_eq!(
        t.client().try_migrate(),
        Err(Ok(ContractError::NotInitialized))
    );
}
