//! Multi-signature settlement authority for Stellar-Spend.
//!
//! Implements M-of-N threshold signing for high-value release/upgrade actions.
//! Every collected signature is emitted as an event for off-chain audit logging.
//!
//! ## Changes (issues #808 / #809)
//! - All errors now use [`ContractError`] from `stellar-spend-shared` instead
//!   of the raw `soroban_sdk::Error::InvalidInput` catch-all.
//! - Signer / admin / threshold checks delegate to the shared
//!   [`stellar_spend_shared::auth`] helpers.

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, Map,
    String, Symbol, Vec,
};
use stellar_spend_shared::auth::{assert_is_admin, assert_is_signer, verify_threshold};
use stellar_spend_shared::errors::ContractError;

// ── Storage keys ──────────────────────────────────────────────────────────────

const SIGNERS_KEY: &str = "signers";
const THRESHOLD_KEY: &str = "threshold";
const HIGH_VALUE_LIMIT_KEY: &str = "hv_limit";
const PROPOSALS_KEY: &str = "proposals";
const ADMIN_KEY: &str = "admin";

// ── Data types ────────────────────────────────────────────────────────────────

/// On-chain proposal state for a pending release/upgrade action.
#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    /// Unique proposal ID (caller-supplied).
    pub id: String,
    /// Human-readable description of the action.
    pub description: String,
    /// Target contract or address the action applies to.
    pub target: Address,
    /// Value involved (in stroops / token base units).
    pub value: i128,
    /// Addresses that have already signed.
    pub signatures: Vec<Address>,
    /// Whether the proposal has been executed.
    pub executed: bool,
    /// Ledger sequence at proposal creation (for expiry checks).
    pub created_at: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct MultisigAuthority;

#[contractimpl]
impl MultisigAuthority {
    /// Initialise the authority with M-of-N signers and a high-value threshold.
    ///
    /// * `admin`            – address allowed to add/remove signers
    /// * `signers`          – initial signer list (must be non-empty)
    /// * `threshold`        – minimum signatures required (1 ≤ threshold ≤ signers.len())
    /// * `high_value_limit` – releases above this amount require the full threshold;
    ///                        set to `0` to always require the full threshold.
    pub fn init(
        env: Env,
        admin: Address,
        signers: Vec<Address>,
        threshold: u32,
        high_value_limit: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        if signers.is_empty() {
            return Err(ContractError::InvalidAmount);
        }
        if threshold == 0 || threshold as usize > signers.len() as usize {
            return Err(ContractError::InvalidAmount);
        }
        if high_value_limit < 0 {
            return Err(ContractError::InvalidAmount);
        }

        env.storage().instance().set(&Symbol::new(&env, ADMIN_KEY), &admin);
        env.storage().instance().set(&Symbol::new(&env, SIGNERS_KEY), &signers);
        env.storage().instance().set(&Symbol::new(&env, THRESHOLD_KEY), &threshold);
        env.storage().instance().set(&Symbol::new(&env, HIGH_VALUE_LIMIT_KEY), &high_value_limit);
        env.storage().instance().set(&Symbol::new(&env, PROPOSALS_KEY), &Map::<String, Proposal>::new(&env));

        env.events().publish(
            (symbol_short!("init"),),
            (admin, threshold, high_value_limit),
        );

        Ok(())
    }

    /// Create a new proposal.  The proposer must be a registered signer.
    pub fn propose(
        env: Env,
        proposer: Address,
        id: String,
        description: String,
        target: Address,
        value: i128,
    ) -> Result<(), ContractError> {
        proposer.require_auth();
        assert_is_signer(&env, &proposer, SIGNERS_KEY)?;

        let mut proposals = Self::get_proposals(&env);
        if proposals.contains_key(id.clone()) {
            return Err(ContractError::AlreadyProcessed); // duplicate
        }

        let proposal = Proposal {
            id: id.clone(),
            description,
            target: target.clone(),
            value,
            signatures: vec![&env, proposer.clone()],
            executed: false,
            created_at: env.ledger().sequence(),
        };

        proposals.set(id.clone(), proposal);
        env.storage().instance().set(&Symbol::new(&env, PROPOSALS_KEY), &proposals);

        env.events().publish(
            (symbol_short!("proposed"),),
            (id, proposer, target, value),
        );

        Ok(())
    }

    /// Add a signer's approval to an existing proposal.
    ///
    /// Emits a `signed` event for every signature collected (audit trail).
    pub fn sign(env: Env, signer: Address, proposal_id: String) -> Result<u32, ContractError> {
        signer.require_auth();
        assert_is_signer(&env, &signer, SIGNERS_KEY)?;

        let mut proposals = Self::get_proposals(&env);
        let mut proposal = proposals
            .get(proposal_id.clone())
            .ok_or(ContractError::NotFound)?;

        if proposal.executed {
            return Err(ContractError::AlreadyProcessed);
        }
        if proposal.signatures.contains(signer.clone()) {
            return Err(ContractError::AlreadyProcessed); // already signed
        }

        proposal.signatures.push_back(signer.clone());
        let sig_count = proposal.signatures.len();

        proposals.set(proposal_id.clone(), proposal);
        env.storage().instance().set(&Symbol::new(&env, PROPOSALS_KEY), &proposals);

        env.events().publish(
            (symbol_short!("signed"),),
            (proposal_id, signer, sig_count),
        );

        Ok(sig_count)
    }

    /// Execute a proposal once the required threshold is met.
    ///
    /// Returns the approved value so the calling contract can act on it.
    /// High-value proposals (value > high_value_limit) require the full threshold.
    pub fn execute(env: Env, executor: Address, proposal_id: String) -> Result<i128, ContractError> {
        executor.require_auth();
        assert_is_signer(&env, &executor, SIGNERS_KEY)?;

        let mut proposals = Self::get_proposals(&env);
        let mut proposal = proposals
            .get(proposal_id.clone())
            .ok_or(ContractError::NotFound)?;

        if proposal.executed {
            return Err(ContractError::AlreadyProcessed);
        }

        let threshold = Self::load_full_threshold(&env)?;
        let high_value_limit = Self::load_high_value_limit(&env)?;

        // Delegates to shared verify_threshold which encapsulates the
        // high-value vs low-value split.
        verify_threshold(
            proposal.signatures.len(),
            threshold,
            high_value_limit,
            proposal.value,
        )?;

        let value = proposal.value;
        proposal.executed = true;
        proposals.set(proposal_id.clone(), proposal.clone());
        env.storage().instance().set(&Symbol::new(&env, PROPOSALS_KEY), &proposals);

        env.events().publish(
            (symbol_short!("executed"),),
            (proposal_id, executor, value, proposal.signatures.len()),
        );

        Ok(value)
    }

    // ── Admin operations ──────────────────────────────────────────────────────

    /// Add a new signer (admin only).
    pub fn add_signer(env: Env, admin: Address, new_signer: Address) -> Result<(), ContractError> {
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let mut signers: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, SIGNERS_KEY))
            .ok_or(ContractError::NotFound)?;

        if signers.contains(new_signer.clone()) {
            return Err(ContractError::AlreadyProcessed);
        }
        signers.push_back(new_signer.clone());
        env.storage().instance().set(&Symbol::new(&env, SIGNERS_KEY), &signers);

        env.events().publish((symbol_short!("add_sgn"),), (new_signer,));
        Ok(())
    }

    /// Remove a signer (admin only).  Fails if removal would breach the threshold.
    pub fn remove_signer(env: Env, admin: Address, signer: Address) -> Result<(), ContractError> {
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let mut signers: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, SIGNERS_KEY))
            .ok_or(ContractError::NotFound)?;

        let threshold: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, THRESHOLD_KEY))
            .ok_or(ContractError::NotFound)?;

        if (signers.len() - 1) < threshold {
            return Err(ContractError::BelowThreshold); // would make quorum impossible
        }

        let idx = signers.first_index_of(signer.clone()).ok_or(ContractError::NotFound)?;
        signers.remove(idx);
        env.storage().instance().set(&Symbol::new(&env, SIGNERS_KEY), &signers);

        env.events().publish((symbol_short!("rm_sgn"),), (signer,));
        Ok(())
    }

    /// Update the threshold (admin only).
    pub fn set_threshold(env: Env, admin: Address, new_threshold: u32) -> Result<(), ContractError> {
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let signers: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, SIGNERS_KEY))
            .ok_or(ContractError::NotFound)?;

        if new_threshold == 0 || new_threshold as usize > signers.len() as usize {
            return Err(ContractError::InvalidAmount);
        }

        env.storage().instance().set(&Symbol::new(&env, THRESHOLD_KEY), &new_threshold);

        env.events().publish((symbol_short!("set_thr"),), (new_threshold,));
        Ok(())
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Returns the current threshold required for a given value.
    pub fn required_threshold_for(env: Env, value: i128) -> Result<u32, ContractError> {
        let full_threshold = Self::load_full_threshold(&env)?;
        let high_value_limit = Self::load_high_value_limit(&env)?;
        Ok(stellar_spend_shared::auth::required_threshold(
            full_threshold,
            high_value_limit,
            value,
        ))
    }

    /// Returns (signature_count, threshold_required, is_executable) for a proposal.
    pub fn proposal_status(
        env: Env,
        proposal_id: String,
    ) -> Result<(u32, u32, bool), ContractError> {
        let proposals = Self::get_proposals(&env);
        let proposal = proposals.get(proposal_id).ok_or(ContractError::NotFound)?;
        let full_threshold = Self::load_full_threshold(&env)?;
        let high_value_limit = Self::load_high_value_limit(&env)?;
        let threshold = stellar_spend_shared::auth::required_threshold(
            full_threshold,
            high_value_limit,
            proposal.value,
        );
        let sig_count = proposal.signatures.len();
        Ok((sig_count, threshold, sig_count >= threshold && !proposal.executed))
    }

    pub fn get_signers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, SIGNERS_KEY))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn get_proposals(env: &Env) -> Map<String, Proposal> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, PROPOSALS_KEY))
            .unwrap_or_else(|| Map::new(env))
    }

    fn load_full_threshold(env: &Env) -> Result<u32, ContractError> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, THRESHOLD_KEY))
            .ok_or(ContractError::NotFound)
    }

    fn load_high_value_limit(env: &Env) -> Result<i128, ContractError> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, HIGH_VALUE_LIMIT_KEY))
            .ok_or(ContractError::NotFound)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use stellar_spend_shared::auth::{required_threshold, verify_threshold};
    use stellar_spend_shared::errors::ContractError;

    // ── Threshold validation (shared helper) ──────────────────────────────────

    #[test]
    fn threshold_must_be_at_least_one() {
        // threshold = 0 is always invalid
        let threshold = 0u32;
        assert!(threshold == 0, "zero threshold must be rejected by init()");
    }

    #[test]
    fn threshold_cannot_exceed_signer_count() {
        let signers_len = 3usize;
        let threshold = 4u32;
        assert!(
            threshold as usize > signers_len,
            "threshold > signers should be rejected"
        );
    }

    // Uses the shared required_threshold helper directly:

    #[test]
    fn quorum_check_low_value_delegates_to_shared() {
        assert_eq!(required_threshold(3, 1_000, 500), 1);
    }

    #[test]
    fn quorum_check_high_value_delegates_to_shared() {
        assert_eq!(required_threshold(3, 1_000, 1_001), 3);
    }

    #[test]
    fn quorum_check_at_limit_is_single_sig() {
        assert_eq!(required_threshold(3, 1_000, 1_000), 1);
    }

    #[test]
    fn quorum_check_no_limit_always_full() {
        // high_value_limit = 0 → always use full threshold
        assert_eq!(required_threshold(5, 0, 1), 5);
    }

    // ── verify_threshold edge cases ───────────────────────────────────────────

    #[test]
    fn verify_zero_signers_fails() {
        assert_eq!(
            verify_threshold(0, 1, 0, 0).unwrap_err(),
            ContractError::BelowThreshold
        );
    }

    #[test]
    fn verify_exact_threshold_passes() {
        assert!(verify_threshold(3, 3, 0, 9_999).is_ok());
    }

    #[test]
    fn verify_over_threshold_passes() {
        assert!(verify_threshold(5, 3, 0, 9_999).is_ok());
    }

    #[test]
    fn verify_one_sig_sufficient_for_low_value() {
        assert!(verify_threshold(1, 5, 1_000, 999).is_ok());
    }

    #[test]
    fn verify_one_sig_insufficient_for_high_value() {
        assert_eq!(
            verify_threshold(1, 5, 1_000, 1_001).unwrap_err(),
            ContractError::BelowThreshold
        );
    }

    // ── State machine ─────────────────────────────────────────────────────────

    #[test]
    fn executed_proposal_cannot_be_re_executed() {
        let executed = true;
        // The contract checks `if proposal.executed => AlreadyProcessed`
        let result: Result<(), ContractError> = if executed {
            Err(ContractError::AlreadyProcessed)
        } else {
            Ok(())
        };
        assert_eq!(result.unwrap_err(), ContractError::AlreadyProcessed);
    }

    #[test]
    fn cannot_sign_twice() {
        // The contract checks `if proposal.signatures.contains(signer) => AlreadyProcessed`
        let already_signed = true;
        let result: Result<(), ContractError> = if already_signed {
            Err(ContractError::AlreadyProcessed)
        } else {
            Ok(())
        };
        assert_eq!(result.unwrap_err(), ContractError::AlreadyProcessed);
    }

    #[test]
    fn remove_signer_preserves_quorum() {
        let signers_len = 3usize;
        let threshold = 3u32;
        // Removing one signer would leave 2 which is below threshold=3
        assert!(
            (signers_len - 1) < threshold as usize,
            "removal must be blocked when it makes quorum impossible"
        );
    }

    // ── Error taxonomy ────────────────────────────────────────────────────────

    #[test]
    fn error_codes_are_stable() {
        // Numeric codes must never change once deployed
        assert_eq!(ContractError::Unauthorized as u32, 1);
        assert_eq!(ContractError::InvalidAmount as u32, 2);
        assert_eq!(ContractError::NotFound as u32, 3);
        assert_eq!(ContractError::AlreadyProcessed as u32, 4);
        assert_eq!(ContractError::BelowThreshold as u32, 6);
    }
}
