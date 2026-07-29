//! Escrow unit tests.
//!
//! Every test opens from a fixture in [`crate::test_utils`] rather than repeating
//! `Env::default()` / `register` / `init` (issue #818). Assertions go through the
//! generated `try_*` client methods so that a contract error is checked by value
//! instead of being swallowed by a panic.

use soroban_sdk::{symbol_short, testutils::Address as _, Address, IntoVal};
use stellar_spend_shared::errors::ContractError;

use crate::test_utils::{assert_fresh_init_is_current, EscrowTest, START_LEDGER};
use crate::{DEFAULT_TIMEOUT_LEDGERS, MAX_TIMEOUT_LEDGERS, SCHEMA_VERSION};

// ── Initialisation ───────────────────────────────────────────────────────────

#[test]
fn init_persists_authority_and_schema() {
    let t = EscrowTest::setup();
    assert_fresh_init_is_current(&t);
    assert_eq!(t.client().schema_version(), SCHEMA_VERSION);
}

#[test]
fn init_is_rejected_twice() {
    let t = EscrowTest::setup();
    // A second init must not silently reassign the settlement authority.
    assert_eq!(
        t.client().try_init(&t.other),
        Err(Ok(ContractError::AlreadyInitialized))
    );
}

#[test]
fn entrypoints_reject_an_uninitialised_contract() {
    let t = EscrowTest::registered();
    assert_eq!(
        t.client().try_deposit(&t.depositor, &100, &t.bridge, &0),
        Err(Ok(ContractError::NotInitialized))
    );
    assert_eq!(
        t.client().try_schema_version(),
        Err(Ok(ContractError::NotInitialized))
    );
}

// ── Deposit validation (issue #816) ──────────────────────────────────────────

#[test]
fn deposit_rejects_non_positive_amounts() {
    let t = EscrowTest::setup();
    for bad in [0i128, -1, i128::MIN] {
        assert_eq!(
            t.client().try_deposit(&t.depositor, &bad, &t.bridge, &0),
            Err(Ok(ContractError::InvalidAmount)),
            "amount {bad} must be rejected"
        );
    }
}

#[test]
fn deposit_rejects_fee_above_one_hundred_percent() {
    let t = EscrowTest::setup();
    assert_eq!(
        t.client()
            .try_deposit(&t.depositor, &100, &t.bridge, &10_001),
        Err(Ok(ContractError::InvalidInput))
    );
    // Exactly 100% is the boundary and is accepted.
    assert!(t
        .client()
        .try_deposit(&t.depositor, &100, &t.bridge, &10_000)
        .is_ok());
}

#[test]
fn deposit_ids_are_unique_and_monotonic() {
    let t = EscrowTest::setup();
    let first = t.deposit(100);
    let second = t.deposit(100);
    let third = t.deposit(250);
    assert_eq!((first, second, third), (0, 1, 2));
}

#[test]
fn deposit_records_the_quoted_fee_and_timeout() {
    let t = EscrowTest::setup();
    let id = t.deposit_with_fee(1_000, 25);
    let record = t.client().get_deposit(&id);

    assert_eq!(record.amount, 1_000);
    assert_eq!(record.fee_bps, 25);
    assert_eq!(record.depositor, t.depositor);
    assert_eq!(record.bridge_address, t.bridge);
    assert!(!record.released && !record.refunded);
    assert_eq!(
        record.timeout_ledger,
        START_LEDGER + DEFAULT_TIMEOUT_LEDGERS
    );
}

#[test]
fn get_deposit_reports_a_missing_id() {
    let t = EscrowTest::setup();
    assert_eq!(
        t.client().try_get_deposit(&42),
        Err(Ok(ContractError::NotFound))
    );
}

// ── Release ──────────────────────────────────────────────────────────────────

#[test]
fn release_returns_the_amount_and_marks_the_record() {
    let t = EscrowTest::setup();
    let id = t.deposit(750);
    let recipient = Address::generate(&t.env);

    assert_eq!(t.client().release(&id, &recipient), 750);

    let record = t.client().get_deposit(&id);
    assert!(record.released);
    assert!(!record.refunded);
}

#[test]
fn release_is_not_repeatable() {
    let t = EscrowTest::setup();
    let id = t.deposit(750);
    let recipient = Address::generate(&t.env);
    t.client().release(&id, &recipient);

    assert_eq!(
        t.client().try_release(&id, &recipient),
        Err(Ok(ContractError::AlreadyProcessed))
    );
}

#[test]
fn release_is_blocked_after_a_refund() {
    let t = EscrowTest::setup();
    let id = t.deposit(750);
    t.advance_past_timeout();
    t.client().refund(&id);

    let recipient = Address::generate(&t.env);
    assert_eq!(
        t.client().try_release(&id, &recipient),
        Err(Ok(ContractError::AlreadyProcessed))
    );
}

#[test]
fn release_reports_a_missing_deposit() {
    let t = EscrowTest::setup();
    let recipient = Address::generate(&t.env);
    assert_eq!(
        t.client().try_release(&9, &recipient),
        Err(Ok(ContractError::NotFound))
    );
}

// ── Refund ───────────────────────────────────────────────────────────────────

#[test]
fn refund_is_blocked_before_the_timeout_ledger() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);

    assert_eq!(t.client().try_refund(&id), Err(Ok(ContractError::Expired)));

    // One ledger short of the deadline is still too early.
    t.advance_ledgers(DEFAULT_TIMEOUT_LEDGERS - 1);
    assert_eq!(t.client().try_refund(&id), Err(Ok(ContractError::Expired)));
}

#[test]
fn refund_succeeds_exactly_at_the_timeout_ledger() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);
    // `refund` compares with `>=`, so landing exactly on the deadline must work.
    t.advance_ledgers(DEFAULT_TIMEOUT_LEDGERS);

    assert_eq!(t.client().refund(&id), 400);
    assert!(t.client().get_deposit(&id).refunded);
}

#[test]
fn refund_is_not_repeatable() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);
    t.advance_past_timeout();
    t.client().refund(&id);

    assert_eq!(
        t.client().try_refund(&id),
        Err(Ok(ContractError::AlreadyProcessed))
    );
}

#[test]
fn refund_is_blocked_after_a_release() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);
    let recipient = Address::generate(&t.env);
    t.client().release(&id, &recipient);
    t.advance_past_timeout();

    assert_eq!(
        t.client().try_refund(&id),
        Err(Ok(ContractError::AlreadyProcessed))
    );
}

#[test]
fn can_refund_tracks_the_deposit_lifecycle() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);

    assert!(!t.client().can_refund(&id), "not yet timed out");
    t.advance_past_timeout();
    assert!(t.client().can_refund(&id), "timed out and still open");

    t.client().refund(&id);
    assert!(!t.client().can_refund(&id), "already refunded");
}

// ── Timeout configuration ────────────────────────────────────────────────────

#[test]
fn set_timeout_enforces_its_bounds() {
    let t = EscrowTest::setup();

    assert_eq!(
        t.client().try_set_timeout(&0),
        Err(Ok(ContractError::InvalidInput)),
        "a zero timeout would make deposits refundable immediately"
    );
    assert_eq!(
        t.client().try_set_timeout(&(MAX_TIMEOUT_LEDGERS + 1)),
        Err(Ok(ContractError::InvalidInput))
    );

    assert!(t.client().try_set_timeout(&1).is_ok());
    assert!(t.client().try_set_timeout(&MAX_TIMEOUT_LEDGERS).is_ok());
}

#[test]
fn set_timeout_does_not_retroactively_extend_open_deposits() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);
    let original_deadline = t.client().get_deposit(&id).timeout_ledger;

    t.client().set_timeout(&MAX_TIMEOUT_LEDGERS);

    assert_eq!(
        t.client().get_deposit(&id).timeout_ledger,
        original_deadline,
        "an existing deposit's deadline must not move when the default changes"
    );

    // ...but the next deposit picks the new value up.
    let later = t.deposit(400);
    assert_eq!(
        t.client().get_deposit(&later).timeout_ledger,
        START_LEDGER + MAX_TIMEOUT_LEDGERS
    );
}

// ── Arithmetic guards ────────────────────────────────────────────────────────

#[test]
fn deposit_rejects_a_timeout_that_would_overflow_the_ledger_counter() {
    // The sequence must sit within MAX_TIMEOUT_LEDGERS of u32::MAX for the addition
    // to wrap, while the entry TTL stays small enough that `sequence + ttl` does not
    // overflow first — otherwise the host archives storage before the test runs.
    let t = EscrowTest::registered_at(u32::MAX - 5_000_000, 1_000_000);
    t.client().init(&t.admin);
    t.client().set_timeout(&MAX_TIMEOUT_LEDGERS);

    assert_eq!(
        t.client().try_deposit(&t.depositor, &100, &t.bridge, &0),
        Err(Ok(ContractError::Overflow)),
        "current_ledger + timeout must not wrap into an instantly-refundable deposit"
    );
}

// ── Event assertions (issue #814) ────────────────────────────────────────────
//
// Every state-changing entrypoint emits a corresponding event. These tests assert
// the exact topic and data fields so off-chain indexers can rely on the shape.
// Pattern: call the function, then compare env.events().all() to the expected vec.

#[test]
fn init_emits_event_with_settlement_authority() {
    let t = EscrowTest::registered();
    t.client().init(&t.admin);

    // The init event is the only event emitted by this call.
    // Topic: ("init",)   Data: settlement_authority
    assert_eq!(
        t.env.events().all(),
        soroban_sdk::vec![
            &t.env,
            (
                t.contract_id.clone(),
                (symbol_short!("init"),).into_val(&t.env),
                t.admin.into_val(&t.env),
            ),
        ]
    );
}

#[test]
fn deposit_emits_event_with_id_depositor_amount_bridge() {
    let t = EscrowTest::setup();
    // Clear setup events by creating a fresh env snapshot perspective;
    // env.events().all() returns ALL events since env creation. We snapshot the
    // count after setup, then check only the deposit event.
    let setup_count = t.env.events().all().len();
    let id = t.deposit_with_fee(500, 10);
    let all_events = t.env.events().all();

    // The deposit event is the first event after setup.
    let deposit_event = all_events.get(setup_count).unwrap();
    assert_eq!(
        deposit_event,
        (
            t.contract_id.clone(),
            (symbol_short!("deposit"),).into_val(&t.env),
            (id, t.depositor.clone(), 500i128, t.bridge.clone()).into_val(&t.env),
        )
    );
}

#[test]
fn release_emits_event_with_deposit_id_recipient_amount() {
    let t = EscrowTest::setup();
    let id = t.deposit(750);
    let recipient = Address::generate(&t.env);
    let before_release = t.env.events().all().len();

    t.client().release(&id, &recipient);
    let all_events = t.env.events().all();
    let release_event = all_events.get(before_release).unwrap();

    assert_eq!(
        release_event,
        (
            t.contract_id.clone(),
            (symbol_short!("release"),).into_val(&t.env),
            (id, recipient, 750i128).into_val(&t.env),
        )
    );
}

#[test]
fn refund_emits_event_with_deposit_id_depositor_amount() {
    let t = EscrowTest::setup();
    let id = t.deposit(400);
    t.advance_past_timeout();
    let before_refund = t.env.events().all().len();

    t.client().refund(&id);
    let all_events = t.env.events().all();
    let refund_event = all_events.get(before_refund).unwrap();

    assert_eq!(
        refund_event,
        (
            t.contract_id.clone(),
            (symbol_short!("refund"),).into_val(&t.env),
            (id, t.depositor.clone(), 400i128).into_val(&t.env),
        )
    );
}

#[test]
fn set_timeout_emits_event_with_new_timeout_value() {
    let t = EscrowTest::setup();
    let before = t.env.events().all().len();

    t.client().set_timeout(&12_345);
    let all_events = t.env.events().all();
    let timeout_event = all_events.get(before).unwrap();

    assert_eq!(
        timeout_event,
        (
            t.contract_id.clone(),
            (symbol_short!("timeout"),).into_val(&t.env),
            12_345u32.into_val(&t.env),
        )
    );
}

#[test]
fn migrate_emits_event_with_from_and_to_schema_versions() {
    let t = EscrowTest::with_legacy_v1_state();
    let before = t.env.events().all().len();

    t.client().migrate();
    let all_events = t.env.events().all();
    let migrate_event = all_events.get(before).unwrap();

    assert_eq!(
        migrate_event,
        (
            t.contract_id.clone(),
            (symbol_short!("migrate"),).into_val(&t.env),
            (1u32, SCHEMA_VERSION).into_val(&t.env),
        )
    );
}
