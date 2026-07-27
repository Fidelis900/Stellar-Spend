//! End-to-end lifecycle tests for `escrow`, driven through the generated client.
//!
//! `src/tests.rs` covers per-entry-point behaviour and authorisation. This file covers
//! whole flows across multiple entry points and multiple concurrent deposits.

use escrow::{EscrowContract, EscrowContractClient, Error};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, Env, String};

const DEFAULT_TIMEOUT_LEDGERS: u32 = 604_800;

struct Harness {
    env: Env,
    client: EscrowContractClient<'static>,
}

fn harness() -> Harness {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    client.init(&Address::generate(&env));
    Harness { env, client }
}

impl Harness {
    fn deposit(&self, amount: i128) -> String {
        self.client.deposit(
            &Address::generate(&self.env),
            &amount,
            &Address::generate(&self.env),
            &Address::generate(&self.env),
        )
    }

    fn advance(&self, by: u32) {
        self.env.ledger().with_mut(|li| li.sequence_number += by);
    }
}

#[test]
fn happy_path_deposit_then_release() {
    let h = harness();
    let id = h.deposit(100i128);

    assert_eq!(h.client.get_deposit(&id), (100i128, false, false));
    assert!(!h.client.can_refund(&id));

    let recipient = Address::generate(&h.env);
    assert_eq!(h.client.release(&id, &recipient), 100i128);
    assert_eq!(h.client.get_deposit(&id), (100i128, true, false));
}

#[test]
fn timeout_path_deposit_then_refund() {
    let h = harness();
    let id = h.deposit(250i128);

    assert!(!h.client.can_refund(&id), "not refundable before timeout");
    h.advance(DEFAULT_TIMEOUT_LEDGERS);
    assert!(
        h.client.can_refund(&id),
        "refundable once ledger reaches timeout_ledger"
    );

    assert_eq!(h.client.refund(&id), 250i128);
    assert_eq!(h.client.get_deposit(&id), (250i128, false, true));
}

#[test]
fn release_and_refund_are_mutually_exclusive() {
    let h = harness();
    let released_id = h.deposit(10i128);
    let refunded_id = h.deposit(20i128);
    let recipient = Address::generate(&h.env);

    h.client.release(&released_id, &recipient);
    h.advance(DEFAULT_TIMEOUT_LEDGERS);
    h.client.refund(&refunded_id);

    // Each deposit is terminal in its own way and neither can cross over.
    assert_eq!(
        h.client.try_refund(&released_id),
        Err(Ok(Error::AlreadyReleased))
    );
    assert_eq!(
        h.client.try_release(&refunded_id, &recipient),
        Err(Ok(Error::AlreadyRefunded))
    );
}

#[test]
fn concurrent_deposits_settle_independently() {
    let h = harness();
    let ids: [String; 3] = [h.deposit(1i128), h.deposit(2i128), h.deposit(3i128)];

    // All three IDs are distinct even though they share a ledger.
    assert_ne!(ids[0], ids[1]);
    assert_ne!(ids[1], ids[2]);
    assert_ne!(ids[0], ids[2]);

    let recipient = Address::generate(&h.env);
    h.client.release(&ids[1], &recipient);

    // Releasing the middle deposit leaves the others untouched.
    assert_eq!(h.client.get_deposit(&ids[0]), (1i128, false, false));
    assert_eq!(h.client.get_deposit(&ids[1]), (2i128, true, false));
    assert_eq!(h.client.get_deposit(&ids[2]), (3i128, false, false));

    h.advance(DEFAULT_TIMEOUT_LEDGERS);
    assert_eq!(h.client.refund(&ids[0]), 1i128);
    assert!(!h.client.can_refund(&ids[1]), "released deposit stays settled");
    assert!(h.client.can_refund(&ids[2]), "untouched deposit still refundable");
}

#[test]
fn refund_survives_an_unavailable_settlement_authority() {
    // The scenario ADR-008's refund guarantee exists for: the authority never releases,
    // and the user exits with no cooperation and no authorisation entries.
    let h = harness();
    let id = h.deposit(500i128);
    h.advance(DEFAULT_TIMEOUT_LEDGERS);

    h.env.set_auths(&[]);
    assert_eq!(h.client.refund(&id), 500i128);
}
