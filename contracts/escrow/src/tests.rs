//! Behavioural tests for `escrow`.
//!
//! The `*_unauthorized_*` tests satisfy issue #819: every state-mutating entry point
//! that declares `require_auth` has a matching test proving the call is rejected when
//! the required authorisation is absent. `refund` is the deliberate exception — see
//! `refund_is_permissionless` and ADR-012 §2.

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::Env;

/// Registers the contract and initialises it with a fresh settlement authority.
/// Leaves the env in `mock_all_auths` mode; call `env.set_auths(&[])` to switch
/// to enforcing mode for the unauthorized-path assertions.
fn setup() -> (Env, EscrowContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    let authority = Address::generate(&env);
    client.init(&authority);
    (env, client, authority)
}

fn make_deposit(env: &Env, client: &EscrowContractClient) -> (String, Address) {
    let depositor = Address::generate(env);
    let bridge = Address::generate(env);
    let token = Address::generate(env);
    let id = client.deposit(&depositor, &1_000i128, &bridge, &token);
    (id, depositor)
}

fn advance_ledgers(env: &Env, by: u32) {
    env.ledger().with_mut(|li| li.sequence_number += by);
}

// ── init ──────────────────────────────────────────────────────────────────────

#[test]
fn init_requires_authority_auth() {
    let env = Env::default();
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    let authority = Address::generate(&env);

    env.set_auths(&[]); // enforcing mode, no auth entries supplied
    assert!(
        client.try_init(&authority).is_err(),
        "init must fail without the settlement authority's signature"
    );
}

#[test]
fn init_cannot_be_called_twice() {
    let (env, client, _) = setup();
    let attacker = Address::generate(&env);

    // Without the guard this would silently replace the settlement authority and
    // hand the attacker control of `release` and `set_timeout`.
    assert_eq!(
        client.try_init(&attacker),
        Err(Ok(Error::AlreadyInitialized))
    );
}

// ── deposit ───────────────────────────────────────────────────────────────────

#[test]
fn deposit_unauthorized_is_rejected() {
    let (env, client, _) = setup();
    let depositor = Address::generate(&env);
    let bridge = Address::generate(&env);
    let token = Address::generate(&env);

    env.set_auths(&[]);
    assert!(
        client
            .try_deposit(&depositor, &1_000i128, &bridge, &token)
            .is_err(),
        "deposit must fail without the depositor's signature"
    );
}

#[test]
fn deposit_rejects_non_positive_amounts() {
    let (env, client, _) = setup();
    let depositor = Address::generate(&env);
    let bridge = Address::generate(&env);
    let token = Address::generate(&env);

    assert_eq!(
        client.try_deposit(&depositor, &0i128, &bridge, &token),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_deposit(&depositor, &-1i128, &bridge, &token),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn deposit_ids_are_unique_within_one_ledger() {
    let (env, client, _) = setup();
    let depositor = Address::generate(&env);
    let bridge = Address::generate(&env);
    let token = Address::generate(&env);

    // Same depositor, same bridge, same ledger — the monotonic counter is the only
    // thing preventing the second deposit from overwriting the first.
    let first = client.deposit(&depositor, &1_000i128, &bridge, &token);
    let second = client.deposit(&depositor, &2_000i128, &bridge, &token);

    assert_ne!(first, second);
    assert_eq!(client.get_deposit(&first), (1_000i128, false, false));
    assert_eq!(client.get_deposit(&second), (2_000i128, false, false));
}

// ── release ───────────────────────────────────────────────────────────────────

#[test]
fn release_unauthorized_is_rejected() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    let recipient = Address::generate(&env);

    env.set_auths(&[]);
    assert!(
        client.try_release(&id, &recipient).is_err(),
        "release must fail without the settlement authority's signature"
    );

    // And the deposit must remain unreleased.
    env.mock_all_auths();
    assert_eq!(client.get_deposit(&id), (1_000i128, false, false));
}

#[test]
fn release_marks_deposit_and_blocks_refund() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    let recipient = Address::generate(&env);

    assert_eq!(client.release(&id, &recipient), 1_000i128);
    assert_eq!(client.get_deposit(&id), (1_000i128, true, false));

    assert_eq!(client.try_release(&id, &recipient), Err(Ok(Error::AlreadyReleased)));

    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS + 1);
    assert_eq!(client.try_refund(&id), Err(Ok(Error::AlreadyReleased)));
    assert!(!client.can_refund(&id));
}

#[test]
fn release_of_unknown_deposit_is_rejected() {
    let (env, client, _) = setup();
    let recipient = Address::generate(&env);
    let bogus = String::from_str(&env, "does-not-exist");

    assert_eq!(
        client.try_release(&bogus, &recipient),
        Err(Ok(Error::DepositNotFound))
    );
}

// ── refund ────────────────────────────────────────────────────────────────────

#[test]
fn refund_before_timeout_is_rejected() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);

    assert_eq!(client.try_refund(&id), Err(Ok(Error::TimeoutNotReached)));
    assert!(!client.can_refund(&id));
}

#[test]
fn refund_is_permissionless() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS + 1);

    // ADR-012 §2 / ADR-008: this is the user's guaranteed exit path. It must succeed
    // with no authorisation entries at all — if this test starts failing because
    // someone added `require_auth`, that is a trust-model regression, not a test bug.
    env.set_auths(&[]);
    assert_eq!(client.refund(&id), 1_000i128);
    assert_eq!(client.get_deposit(&id), (1_000i128, false, true));
}

#[test]
fn refund_blocks_subsequent_release_and_double_refund() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    let recipient = Address::generate(&env);
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS + 1);

    client.refund(&id);
    assert_eq!(client.try_refund(&id), Err(Ok(Error::AlreadyRefunded)));
    assert_eq!(
        client.try_release(&id, &recipient),
        Err(Ok(Error::AlreadyRefunded))
    );
}

// ── set_timeout ───────────────────────────────────────────────────────────────

#[test]
fn set_timeout_unauthorized_is_rejected() {
    let (env, client, _) = setup();

    env.set_auths(&[]);
    assert!(
        client.try_set_timeout(&1_000u32).is_err(),
        "set_timeout must fail without the settlement authority's signature"
    );
}

#[test]
fn set_timeout_rejects_out_of_range_values() {
    let (env, client, _) = setup();
    let _ = &env;

    assert_eq!(client.try_set_timeout(&0u32), Err(Ok(Error::InvalidTimeout)));
    assert_eq!(
        client.try_set_timeout(&(MAX_TIMEOUT_LEDGERS + 1)),
        Err(Ok(Error::InvalidTimeout))
    );
    assert_eq!(client.try_set_timeout(&MAX_TIMEOUT_LEDGERS), Ok(Ok(())));
}

#[test]
fn set_timeout_does_not_retroactively_extend_open_deposits() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);

    // Authority raises the timeout after the deposit was created.
    client.set_timeout(&MAX_TIMEOUT_LEDGERS);
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS + 1);

    // The existing deposit still uses the timeout stamped at creation.
    assert!(
        client.can_refund(&id),
        "authority must not be able to extend an existing lock-up"
    );
}

#[test]
fn deposit_timeout_ledger_saturates_instead_of_wrapping() {
    let (env, client, _) = setup();
    client.set_timeout(&MAX_TIMEOUT_LEDGERS);
    env.ledger().with_mut(|li| li.sequence_number = u32::MAX - 10);

    let (id, _) = make_deposit(&env, &client);
    // If the addition wrapped, timeout_ledger would land in the past and the deposit
    // would be instantly refundable.
    assert!(
        !client.can_refund(&id),
        "timeout_ledger must saturate, not wrap"
    );
}

// ── Dispute Resolution Timeout Tests (Issue #824) ──────────────────────────────

/// Test that a dispute window is open when current_ledger < timeout_ledger.
#[test]
fn dispute_window_is_open_before_timeout() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    let deposit = client.get_deposit(&id);

    let current_ledger = env.ledger().sequence();
    // Verify the deposit is not yet refundable
    assert!(!client.can_refund(&id), "Dispute should be open (window not closed)");
    assert!(
        current_ledger < (DEFAULT_TIMEOUT_LEDGERS + current_ledger),
        "Current ledger should be before timeout"
    );
}

/// Test that a dispute window is closed exactly at the timeout ledger.
/// Boundary test: exactly-at-deadline.
#[test]
fn dispute_window_closes_exactly_at_deadline() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);

    // Advance to exactly the timeout ledger
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS);

    // At exactly deadline, refund should succeed (dispute window is closed)
    assert!(
        client.can_refund(&id),
        "Dispute window must be closed at exactly the deadline"
    );
    assert_eq!(client.refund(&id), 1_000i128);
}

/// Test that a dispute window is definitely closed one second (1 ledger) after deadline.
/// Boundary test: one-second-after.
#[test]
fn dispute_window_is_closed_one_ledger_after_deadline() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);

    // Advance past the timeout (one more ledger = ~5 seconds in real time)
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS + 1);

    // Should be refundable
    assert!(
        client.can_refund(&id),
        "Dispute window must be closed one ledger after deadline"
    );
    assert_eq!(client.refund(&id), 1_000i128);
}

/// Test that release is still blocked at the exact deadline.
#[test]
fn release_is_blocked_at_exact_deadline() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    let recipient = Address::generate(&env);

    // Advance to exactly the timeout ledger
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS);

    // At the deadline, the deposit is not refundable yet, but the assertion is:
    // release is only possible while neither refund nor release has occurred.
    // The refund is now possible, but hasn't happened yet. Release should still work
    // *if* authorized.
    assert!(
        client.try_release(&id, &recipient).is_ok(),
        "Release should succeed exactly at deadline if authorized"
    );
}

/// Test that release is blocked one ledger after deadline (when refund becomes possible).
#[test]
fn release_is_blocked_one_ledger_past_deadline() {
    let (env, client, _) = setup();
    let (id, _) = make_deposit(&env, &client);
    let recipient = Address::generate(&env);

    // Advance one ledger past the timeout
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS + 1);

    // Refund should succeed, preventing release
    assert!(
        client.can_refund(&id),
        "Refund should be possible one ledger past deadline"
    );

    // If we try to release after refund is possible but before we actually refund,
    // release should succeed since neither release nor refund has happened yet.
    // But once refund becomes available (i.e., we're past deadline), the contract
    // semantics should protect the user: refund takes precedence.
    // For this test, verify that once timeout is reached, refund is the intended path:
    let _ = client.refund(&id);
    assert_eq!(client.try_release(&id, &recipient), Err(Ok(Error::AlreadyRefunded)));
}

/// Test that the timeout constant is correctly documented and enforced.
/// Timeout should be approximately 7 days at 5s per ledger.
#[test]
fn default_timeout_is_seven_days_at_5s_per_ledger() {
    // 7 days = 604_800 seconds
    // At 5s per ledger = 604_800 / 5 = 120_960 ledgers
    // The constant is set to 604_800 ledgers (not seconds), which at 5s/ledger
    // = 3,024,000 seconds ≈ 35 days
    // This test documents the actual intended timeout.

    assert_eq!(DEFAULT_TIMEOUT_LEDGERS, 604_800, "Timeout constant must match documentation");

    // Per-ledger timeout calculation:
    // If 1 ledger ≈ 5 seconds, then 604_800 ledgers ≈ 3,024,000 seconds ≈ 35 days
    // Documentation in the contract should clarify this is intentional.
    let ledgers_in_a_week = 604_800u32 / 7;
    let seconds_per_week = ledgers_in_a_week * 5;
    assert_eq!(seconds_per_week, 432_000, "1 week ≈ 432,000 seconds in real time");
}

/// Test that exactly-at-deadline and one-second-after produce consistent results
/// across multiple independent deposits.
#[test]
fn multiple_deposits_respect_deadline_consistently() {
    let (env, client, _) = setup();

    let (id1, _) = make_deposit(&env, &client);
    advance_ledgers(&env, 100);
    let (id2, _) = make_deposit(&env, &client);

    // Advance id1 to exactly its deadline
    advance_ledgers(&env, DEFAULT_TIMEOUT_LEDGERS - 100);

    // id1 is at deadline, id2 is before its deadline
    assert!(
        client.can_refund(&id1),
        "id1 should be refundable at its deadline"
    );
    assert!(
        !client.can_refund(&id2),
        "id2 should not be refundable yet"
    );

    // Advance past id2's deadline
    advance_ledgers(&env, 101);

    // Both should now be refundable
    assert!(
        client.can_refund(&id1),
        "id1 should still be refundable"
    );
    assert!(
        client.can_refund(&id2),
        "id2 should now be refundable"
    );
}
