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
