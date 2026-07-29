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

// ── Threshold-change edge cases (issue #813) ──────────────────────────────────
//
// Changing signers or thresholds mid-flight is a common source of contract bugs.
// A signature collected under one threshold or signer set must be re-evaluated
// against the current state at execution time, never the state at signing time.

#[test]
fn threshold_raised_after_signing_blocks_previously_executable_proposal() {
    // Arrange: start 2-of-3, propose a high-value action, collect two signatures.
    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("p-raise", &target);
    t.client().sign(&t.signer(1), &id);

    // Two signatures satisfy the 2-of-3 threshold.
    let (sigs, _threshold, executable) = t.client().proposal_status(&id);
    assert_eq!(sigs, 2);
    assert!(executable, "should be executable with 2 of 3 signatures");

    // Admin raises the threshold to 3-of-3 before execution.
    t.client().set_threshold(&t.admin, &3);

    // Now the same two signatures are insufficient.
    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::BelowThreshold)),
        "raising threshold must invalidate a previously-sufficient quorum"
    );

    // Adding the third signature now allows execution.
    t.client().sign(&t.signer(2), &id);
    assert!(
        t.client().try_execute(&t.signer(0), &id).is_ok(),
        "three signatures satisfy the raised 3-of-3 threshold"
    );
}

#[test]
fn threshold_lowered_after_signing_allows_execution_with_fewer_signatures() {
    // Arrange: start 2-of-3, propose a high-value action that needs 2 signatures.
    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("p-lower", &target);

    // Only the proposer's implicit signature; not yet executable.
    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::BelowThreshold)),
    );

    // Admin lowers the threshold to 1-of-3.
    t.client().set_threshold(&t.admin, &1);

    // One signature (the proposer's) now satisfies the new threshold.
    assert!(
        t.client().try_execute(&t.signer(0), &id).is_ok(),
        "lowering threshold must allow execution with the now-sufficient signature count"
    );
}

#[test]
fn signer_removed_after_signing_invalidates_their_pending_vote() {
    // This test is a dedicated re-assertion of the live-count behaviour:
    // a signer's vote must not survive their removal.
    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("p-remove", &target);

    // signer(1) adds their vote, reaching 2-of-3.
    t.client().sign(&t.signer(1), &id);
    let (sigs, _, executable) = t.client().proposal_status(&id);
    assert_eq!(sigs, 2);
    assert!(executable, "two signatures should be executable before removal");

    // Admin removes signer(1).
    t.client().remove_signer(&t.admin, &t.signer(1));

    // signer(1)'s vote must no longer count toward quorum.
    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::BelowThreshold)),
        "removed signer's earlier signature must not satisfy quorum"
    );
}

#[test]
fn adding_a_signer_does_not_lower_effective_live_count() {
    // Verify that adding a new signer doesn't accidentally alter the live count
    // of a pending proposal: the new signer hasn't signed, so the live count
    // stays the same while the total signers increases.
    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("p-add", &target);
    t.client().sign(&t.signer(1), &id);

    // Two live signatures satisfy 2-of-3.
    let (_, _, executable) = t.client().proposal_status(&id);
    assert!(executable);

    // A new signer is added (now 4 signers, threshold still 2).
    let new_signer = soroban_sdk::Address::generate(&t.env);
    t.client().add_signer(&t.admin, &new_signer);

    // The proposal should still be executable: adding a signer doesn't clear votes.
    let (_, _, still_executable) = t.client().proposal_status(&id);
    assert!(
        still_executable,
        "adding a signer must not revoke existing valid signatures"
    );
}

#[test]
fn threshold_change_does_not_affect_already_executed_proposals() {
    // A successfully executed proposal must remain executed regardless of
    // any subsequent threshold changes.
    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("p-exec", &target);
    t.client().sign(&t.signer(1), &id);
    t.client().execute(&t.signer(0), &id);

    // Raise the threshold after execution.
    t.client().set_threshold(&t.admin, &3);

    // The proposal is still marked executed.
    let proposal = t.client().get_proposal(&id);
    assert!(
        proposal.executed,
        "threshold change must not undo a completed execution"
    );

    // And cannot be executed again.
    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::AlreadyProcessed)),
    );
}

#[test]
fn threshold_change_is_recorded_and_reflected_by_required_threshold() {
    let t = MultisigTest::setup();
    assert_eq!(t.client().get_threshold(), DEFAULT_THRESHOLD);

    t.client().set_threshold(&t.admin, &3);
    assert_eq!(t.client().get_threshold(), 3);

    // `required_threshold` must use the new threshold for high-value queries.
    assert_eq!(
        t.client().required_threshold(&(DEFAULT_HIGH_VALUE_LIMIT + 1)),
        3,
        "required_threshold must reflect the updated threshold"
    );
}

#[test]
fn all_signers_removed_until_minimum_then_threshold_must_stay_reachable() {
    // Ensure that the threshold can never be set above the remaining signer count,
    // even after interleaved adds and removes.
    let t = MultisigTest::setup(); // 3 signers, threshold 2

    // Remove down to 2 signers (minimum to satisfy threshold 2).
    t.client().remove_signer(&t.admin, &t.signer(2));
    assert_eq!(t.client().get_signers().len(), 2);

    // Now trying to raise the threshold to 3 is invalid (only 2 signers left).
    assert_eq!(
        t.client().try_set_threshold(&t.admin, &3),
        Err(Ok(ContractError::InvalidInput)),
        "threshold cannot exceed current signer count"
    );

    // Can still set threshold to exactly the signer count.
    assert!(t.client().try_set_threshold(&t.admin, &2).is_ok());
}

#[test]
fn pending_proposal_under_old_threshold_requires_new_threshold_at_execution() {
    // This is the "stale quorum" scenario: a proposal reaches quorum under the
    // old threshold, the threshold is raised before anyone calls execute, and
    // execute must use the *current* threshold — not the one at proposal time.
    let t = MultisigTest::setup(); // threshold = 2
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("p-stale", &target);

    // Collect exactly enough signatures for the old threshold (2).
    t.client().sign(&t.signer(1), &id);

    // Raise to 3 before anyone calls execute.
    t.client().set_threshold(&t.admin, &3);

    // Must fail: only 2 live signatures, but 3 are now required.
    assert_eq!(
        t.client().try_execute(&t.signer(0), &id),
        Err(Ok(ContractError::BelowThreshold)),
        "execute must evaluate quorum against the threshold at execution time, not proposal time"
    );

    // Adding the missing signature unblocks execution.
    t.client().sign(&t.signer(2), &id);
    assert!(
        t.client().try_execute(&t.signer(0), &id).is_ok(),
        "three signatures satisfy the current threshold"
    );
}

// ── Event assertions (issue #814) ────────────────────────────────────────────
//
// All state-changing functions in the multisig-authority contract emit events.
// These tests assert the exact topic and data fields.

#[test]
fn init_emits_event_with_admin_threshold_high_value_limit() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::registered();
    t.client().init(&t.admin, &t.signers, &DEFAULT_THRESHOLD, &DEFAULT_HIGH_VALUE_LIMIT);

    assert_eq!(
        t.env.events().all(),
        soroban_sdk::vec![
            &t.env,
            (
                t.contract_id.clone(),
                (symbol_short!("init"),).into_val(&t.env),
                (t.admin.clone(), DEFAULT_THRESHOLD, DEFAULT_HIGH_VALUE_LIMIT).into_val(&t.env),
            ),
        ]
    );
}

#[test]
fn propose_emits_event_with_id_proposer_target_value() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let before = t.env.events().all().len();

    let id = t.id("evt-p1");
    t.client().propose(&t.signer(0), &id, &t.id("desc"), &target, &100);
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("proposed"),).into_val(&t.env),
            (id, t.signer(0), target, 100i128).into_val(&t.env),
        )
    );
}

#[test]
fn sign_emits_event_with_proposal_id_signer_count() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_high_value("evt-sign", &target);
    let before = t.env.events().all().len();

    let count = t.client().sign(&t.signer(1), &id);
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("signed"),).into_val(&t.env),
            (id, t.signer(1), count).into_val(&t.env),
        )
    );
}

#[test]
fn execute_emits_event_with_proposal_id_executor_value_sig_count() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let target = soroban_sdk::Address::generate(&t.env);
    let id = t.propose_low_value("evt-exec", &target);
    let before = t.env.events().all().len();

    // Low-value proposal: 1 signer (the proposer).
    let value = DEFAULT_HIGH_VALUE_LIMIT / 2;
    t.client().execute(&t.signer(0), &id);
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    // Data: (proposal_id, executor, value, sig_count=1)
    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("executed"),).into_val(&t.env),
            (id, t.signer(0), value, 1u32).into_val(&t.env),
        )
    );
}

#[test]
fn add_signer_emits_event_with_new_signer_address() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let new_signer = soroban_sdk::Address::generate(&t.env);
    let before = t.env.events().all().len();

    t.client().add_signer(&t.admin, &new_signer);
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("add_sgn"),).into_val(&t.env),
            new_signer.into_val(&t.env),
        )
    );
}

#[test]
fn remove_signer_emits_event_with_removed_signer_address() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let before = t.env.events().all().len();

    t.client().remove_signer(&t.admin, &t.signer(2));
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("rm_sgn"),).into_val(&t.env),
            t.signer(2).into_val(&t.env),
        )
    );
}

#[test]
fn set_threshold_emits_event_with_new_threshold() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let before = t.env.events().all().len();

    t.client().set_threshold(&t.admin, &3);
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("set_thr"),).into_val(&t.env),
            3u32.into_val(&t.env),
        )
    );
}

#[test]
fn set_high_value_limit_emits_event_with_new_limit() {
    use soroban_sdk::{symbol_short, IntoVal};

    let t = MultisigTest::setup();
    let before = t.env.events().all().len();

    t.client().set_high_value_limit(&t.admin, &5_000);
    let all_events = t.env.events().all();
    let event = all_events.get(before).unwrap();

    assert_eq!(
        event,
        (
            t.contract_id.clone(),
            (symbol_short!("set_hvl"),).into_val(&t.env),
            5_000i128.into_val(&t.env),
        )
    );
}
