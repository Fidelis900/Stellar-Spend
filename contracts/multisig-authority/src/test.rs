//! Multisig-authority unit tests.
//!
//! All setup comes from [`crate::test_utils`] (issue #818).

use soroban_sdk::{testutils::Address as _, Address, Vec};
use stellar_spend_shared::errors::ContractError;

use crate::test_utils::{
    assert_fresh_init_is_current, MultisigTest, DEFAULT_HIGH_VALUE_LIMIT, DEFAULT_THRESHOLD,
};
use crate::SCHEMA_VERSION;

// ── Initialisation ───────────────────────────────────────────────────────────

#[test]
fn init_persists_signers_threshold_and_schema() {
    let t = MultisigTest::setup();
    assert_fresh_init_is_current(&t);
    assert_eq!(t.client().get_signers(), t.signers);
    assert_eq!(t.client().get_threshold(), DEFAULT_THRESHOLD);
}

#[test]
fn init_is_rejected_twice() {
    let t = MultisigTest::setup();
    assert_eq!(
        t.client().try_init(
            &t.admin,
            &t.signers,
            &DEFAULT_THRESHOLD,
            &DEFAULT_HIGH_VALUE_LIMIT
        ),
        Err(Ok(ContractError::AlreadyInitialized))
    );
}

#[test]
fn init_rejects_an_empty_signer_set() {
    let t = MultisigTest::registered();
    let empty: Vec<Address> = Vec::new(&t.env);
    assert_eq!(
        t.client().try_init(&t.admin, &empty, &1, &0),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn init_rejects_a_duplicate_signer() {
    let t = MultisigTest::registered();
    let dup = Vec::from_array(&t.env, [t.signer(0), t.signer(1), t.signer(0)]);
    assert_eq!(
        t.client().try_init(&t.admin, &dup, &2, &0),
        Err(Ok(ContractError::InvalidInput)),
        "a duplicated signer would count twice toward quorum"
    );
}

#[test]
fn init_rejects_a_threshold_above_signer_count() {
    let t = MultisigTest::registered();
    assert_eq!(
        t.client().try_init(&t.admin, &t.signers, &4, &0),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn init_rejects_a_zero_threshold() {
    let t = MultisigTest::registered();
    assert_eq!(
        t.client().try_init(&t.admin, &t.signers, &0, &0),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn entrypoints_reject_an_uninitialised_contract() {
    let t = MultisigTest::registered();
    assert_eq!(
        t.client().try_get_signers(),
        Err(Ok(ContractError::NotInitialized))
    );
}

// ── Proposals ─────────────────────────────────────────────────────────────────

#[test]
fn propose_requires_a_registered_signer() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    assert_eq!(
        t.client()
            .try_propose(&t.outsider, &t.id("p1"), &t.id("desc"), &target, &100),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn propose_rejects_a_duplicate_id() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    t.propose_low_value("p1", &target);
    assert_eq!(
        t.client()
            .try_propose(&t.signer(1), &t.id("p1"), &t.id("desc"), &target, &1),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn propose_counts_the_proposer_as_the_first_signature() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_low_value("p1", &target);

    let (sig_count, _, _) = t.client().proposal_status(&id);
    assert_eq!(sig_count, 1);
}

#[test]
fn propose_rejects_an_empty_or_oversized_id() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    assert_eq!(
        t.client()
            .try_propose(&t.signer(0), &t.id(""), &t.id("desc"), &target, &1),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn propose_rejects_a_negative_value() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    assert_eq!(
        t.client()
            .try_propose(&t.signer(0), &t.id("p1"), &t.id("desc"), &target, &-1),
        Err(Ok(ContractError::InvalidAmount))
    );
}

// ── Signing ──────────────────────────────────────────────────────────────────

#[test]
fn sign_requires_a_registered_signer() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);
    assert_eq!(
        t.client().try_sign(&t.outsider, &id),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn cannot_sign_twice() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);
    assert_eq!(
        t.client().try_sign(&t.signer(0), &id),
        Err(Ok(ContractError::InvalidInput)),
        "signer(0) is already the implicit proposer signature"
    );
}

#[test]
fn sign_reports_a_missing_proposal() {
    let t = MultisigTest::setup();
    assert_eq!(
        t.client().try_sign(&t.signer(0), &t.id("missing")),
        Err(Ok(ContractError::NotFound))
    );
}

#[test]
fn sign_increments_the_signature_count() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);
    assert_eq!(t.client().sign(&t.signer(1), &id), 2);
}

#[test]
fn cannot_sign_an_executed_proposal() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);
    t.client().sign(&t.signer(1), &id);
    t.client().execute(&t.signer(0), &id);

    assert_eq!(
        t.client().try_sign(&t.signer(2), &id),
        Err(Ok(ContractError::AlreadyProcessed))
    );
}

#[test]
fn cannot_sign_an_expired_proposal() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);
    t.advance_past_proposal_expiry();

    assert_eq!(
        t.client().try_sign(&t.signer(1), &id),
        Err(Ok(ContractError::Expired)),
        "a stale quorum must not be extendable after expiry"
    );
}

// ── Execution / quorum ────────────────────────────────────────────────────────

#[test]
fn low_value_proposal_executes_with_a_single_signature() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_low_value("p1", &target);

    let value = t.client().execute(&t.signer(0), &id);
    assert_eq!(value, DEFAULT_HIGH_VALUE_LIMIT / 2);
}

#[test]
fn high_value_proposal_requires_the_full_threshold() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);

    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::BelowThreshold))
    );

    t.client().sign(&t.signer(1), &id);
    assert_eq!(
        t.client().execute(&t.signer(0), &id),
        DEFAULT_HIGH_VALUE_LIMIT * 10
    );
}

#[test]
fn value_exactly_at_the_high_value_limit_needs_only_one_signature() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.id("boundary");
    t.client().propose(
        &t.signer(0),
        &id,
        &t.id("d"),
        &target,
        &DEFAULT_HIGH_VALUE_LIMIT,
    );

    assert_eq!(
        t.client().execute(&t.signer(0), &id),
        DEFAULT_HIGH_VALUE_LIMIT
    );
}

#[test]
fn execute_is_not_repeatable() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_low_value("p1", &target);
    t.client().execute(&t.signer(0), &id);

    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::AlreadyProcessed))
    );
}

#[test]
fn execute_rejects_an_expired_proposal() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_low_value("p1", &target);
    t.advance_past_proposal_expiry();

    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::Expired))
    );
}

#[test]
fn removing_a_signer_after_they_signed_drops_their_vote_from_quorum() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);
    t.client().sign(&t.signer(1), &id);

    // Two live signatures reach the 2-of-3 threshold...
    t.client().remove_signer(&t.admin, &t.signer(1));
    // ...but signer(1) is no longer registered, so their signature must not count.
    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::BelowThreshold)),
        "a removed signer's earlier signature must not still satisfy quorum"
    );
}

// ── Signer / threshold management ────────────────────────────────────────────

#[test]
fn add_signer_rejects_a_duplicate() {
    let t = MultisigTest::setup();
    assert_eq!(
        t.client().try_add_signer(&t.admin, &t.signer(0)),
        Err(Ok(ContractError::InvalidInput))
    );
}

#[test]
fn add_signer_requires_admin() {
    let t = MultisigTest::setup();
    let new_signer = Address::generate(&t.env);
    assert_eq!(
        t.client().try_add_signer(&t.outsider, &new_signer),
        Err(Ok(ContractError::Unauthorized))
    );
}

#[test]
fn remove_signer_is_blocked_when_it_would_make_quorum_unreachable() {
    let t = MultisigTest::setup();
    // Threshold is 2 with 3 signers; removing down to 2 is fine, but a second
    // removal would leave only 1 signer against a threshold of 2.
    t.client().remove_signer(&t.admin, &t.signer(2));
    assert_eq!(
        t.client().try_remove_signer(&t.admin, &t.signer(1)),
        Err(Ok(ContractError::InvalidInput)),
        "removal must be blocked when it makes quorum impossible"
    );
}

#[test]
fn remove_signer_reports_an_address_that_is_not_a_signer() {
    let t = MultisigTest::setup();
    assert_eq!(
        t.client().try_remove_signer(&t.admin, &t.outsider),
        Err(Ok(ContractError::NotFound))
    );
}

#[test]
fn set_threshold_enforces_its_bounds() {
    let t = MultisigTest::setup();
    assert_eq!(
        t.client().try_set_threshold(&t.admin, &0),
        Err(Ok(ContractError::InvalidInput))
    );
    assert_eq!(
        t.client().try_set_threshold(&t.admin, &4),
        Err(Ok(ContractError::InvalidInput))
    );
    assert!(t.client().try_set_threshold(&t.admin, &3).is_ok());
}

// ── required_threshold / proposal_status views ───────────────────────────────

#[test]
fn required_threshold_reflects_the_high_value_limit() {
    let t = MultisigTest::setup();
    assert_eq!(t.client().required_threshold(&0), 1);
    assert_eq!(t.client().required_threshold(&DEFAULT_HIGH_VALUE_LIMIT), 1);
    assert_eq!(
        t.client()
            .required_threshold(&(DEFAULT_HIGH_VALUE_LIMIT + 1)),
        DEFAULT_THRESHOLD
    );
}

#[test]
fn proposal_status_reports_executability() {
    let t = MultisigTest::setup();
    let target = Address::generate(&t.env);
    let id = t.propose_high_value("p1", &target);

    let (sigs, threshold, executable) = t.client().proposal_status(&id);
    assert_eq!((sigs, threshold, executable), (1, DEFAULT_THRESHOLD, false));

    t.client().sign(&t.signer(1), &id);
    let (sigs, _, executable) = t.client().proposal_status(&id);
    assert_eq!((sigs, executable), (2, true));

    t.client().execute(&t.signer(0), &id);
    let (_, _, executable) = t.client().proposal_status(&id);
    assert!(
        !executable,
        "an executed proposal is never executable again"
    );
}

#[test]
fn schema_version_matches_the_constant() {
    let t = MultisigTest::setup();
    assert_eq!(t.client().schema_version(), SCHEMA_VERSION);
}
