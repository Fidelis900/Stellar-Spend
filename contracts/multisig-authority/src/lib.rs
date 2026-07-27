//! Multi-signature settlement authority for Stellar-Spend.
//!
//! Implements M-of-N threshold signing for high-value release/upgrade actions.
//! Every collected signature is emitted as an event for off-chain audit logging.
//!
//! Values at or below `high_value_limit` need a single signature; anything above it
//! needs the full threshold. Setting the limit to `0` requires the full threshold for
//! every proposal.
//!
//! Signer/admin/threshold checks delegate to the shared
//! [`stellar_spend_shared::auth`] helpers, which look up their storage entries by a
//! plain string key — this contract therefore stores `admin`/`signers` under
//! `Symbol::new(&env, "admin" | "signers")` rather than a `#[contracttype]` enum, so
//! those helpers can find them.
//!
//! # Dead code removed (issue #815)
//!
//! * `Proposal::created_at` was documented "for expiry checks" but nothing ever read
//!   it — proposals lived forever, so a signature collected months earlier still
//!   counted toward quorum. Expiry is now enforced against
//!   [`DEFAULT_PROPOSAL_TTL_LEDGERS`] and the field is live.
//! * `required_threshold` was declared `pub fn` inside `#[contractimpl]` while taking
//!   `&Env`, which cannot be exported as an entrypoint. It now takes `Env` and is a
//!   real read-only entrypoint.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short, vec, Address, BytesN, Env,
    Map, String, Symbol, Vec,
};
use stellar_spend_shared::{
    auth::{assert_is_admin, assert_is_signer, verify_threshold},
    errors::ContractError,
    validation::{
        check_schema_version, require_non_negative_amount, require_string_len,
        require_unique_addresses, MAX_SIGNERS,
    },
};

contractmeta!(key = "version", val = "1.0.0");
contractmeta!(key = "contract", val = "stellar-spend-multisig-authority");

// ── Storage keys ──────────────────────────────────────────────────────────────
//
// Plain string keys (not a `#[contracttype]` enum) so `stellar_spend_shared::auth`'s
// `Symbol::new(env, key)` lookups resolve to the same storage entries this contract
// writes.
const ADMIN_KEY: &str = "admin";
const SIGNERS_KEY: &str = "signers";
const THRESHOLD_KEY: &str = "threshold";
const HIGH_VALUE_LIMIT_KEY: &str = "hv_limit";
const PROPOSALS_KEY: &str = "proposals";
const SCHEMA_KEY: &str = "schema";

/// Current storage layout version.
pub const SCHEMA_VERSION: u32 = 2;

/// How long a proposal stays signable, in ledgers (~7 days at 5s close time).
///
/// Without an expiry, a signature gathered under one signer set stays valid after
/// that set has changed, which is how stale quorums get replayed.
pub const DEFAULT_PROPOSAL_TTL_LEDGERS: u32 = 120_960;

/// Maximum length of a proposal id, in bytes.
pub const MAX_PROPOSAL_ID_LEN: u32 = 64;
/// Maximum length of a proposal description, in bytes.
pub const MAX_DESCRIPTION_LEN: u32 = 256;

/// Instance TTL extension (~30 days) applied on state-changing calls.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;
/// Only pay to extend when remaining TTL drops below ~6 days.
pub const INSTANCE_TTL_THRESHOLD: u32 = 103_680;

/// Schema v1 proposal record.
///
/// Retained so [`MultisigAuthority::migrate`] can decode entries written by a v1
/// build. Current code never writes this shape.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalV1 {
    pub id: String,
    pub description: String,
    pub target: Address,
    pub value: i128,
    pub signatures: Vec<Address>,
    pub executed: bool,
    pub created_at: u32,
}

/// Schema v2 proposal record: v1 plus an explicit expiry ledger.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
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
    /// Ledger sequence at proposal creation.
    pub created_at: u32,
    /// Ledger after which the proposal can no longer be signed or executed.
    /// Added in schema v2; migrated records get `created_at + DEFAULT_PROPOSAL_TTL_LEDGERS`.
    pub expires_at: u32,
}

#[contract]
pub struct MultisigAuthority;

#[contractimpl]
impl MultisigAuthority {
    /// Initialise the authority with M-of-N signers and a high-value threshold.
    ///
    /// * `admin`            – address allowed to add/remove signers
    /// * `signers`          – initial signer list (must be non-empty, unique)
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
        if env.storage().instance().has(&Symbol::new(&env, SCHEMA_KEY)) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();

        if signers.is_empty() {
            return Err(ContractError::InvalidInput);
        }
        if signers.len() > MAX_SIGNERS {
            return Err(ContractError::InvalidInput);
        }
        // A duplicated signer would otherwise count twice toward quorum, letting one
        // key satisfy a 2-of-N threshold on its own.
        require_unique_addresses(&signers)?;
        if threshold == 0 || threshold > signers.len() {
            return Err(ContractError::InvalidInput);
        }
        require_non_negative_amount(high_value_limit)?;

        let storage = env.storage().instance();
        storage.set(&Symbol::new(&env, ADMIN_KEY), &admin);
        storage.set(&Symbol::new(&env, SIGNERS_KEY), &signers);
        storage.set(&Symbol::new(&env, THRESHOLD_KEY), &threshold);
        storage.set(&Symbol::new(&env, HIGH_VALUE_LIMIT_KEY), &high_value_limit);
        storage.set(
            &Symbol::new(&env, PROPOSALS_KEY),
            &Map::<String, Proposal>::new(&env),
        );
        storage.set(&Symbol::new(&env, SCHEMA_KEY), &SCHEMA_VERSION);
        Self::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("init"),),
            (admin, threshold, high_value_limit),
        );
        Ok(())
    }

    /// Create a new proposal. The proposer must be a registered signer and their
    /// signature counts as the first approval.
    pub fn propose(
        env: Env,
        proposer: Address,
        id: String,
        description: String,
        target: Address,
        value: i128,
    ) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        require_string_len(&id, MAX_PROPOSAL_ID_LEN)?;
        require_string_len(&description, MAX_DESCRIPTION_LEN)?;
        require_non_negative_amount(value)?;

        proposer.require_auth();
        assert_is_signer(&env, &proposer, SIGNERS_KEY)?;

        let mut proposals = Self::load_proposals(&env);
        if proposals.contains_key(id.clone()) {
            return Err(ContractError::InvalidInput);
        }

        let created_at = env.ledger().sequence();
        let expires_at = created_at
            .checked_add(DEFAULT_PROPOSAL_TTL_LEDGERS)
            .ok_or(ContractError::Overflow)?;

        proposals.set(
            id.clone(),
            Proposal {
                id: id.clone(),
                description,
                target: target.clone(),
                value,
                signatures: vec![&env, proposer.clone()],
                executed: false,
                created_at,
                expires_at,
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PROPOSALS_KEY), &proposals);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("proposed"),), (id, proposer, target, value));
        Ok(())
    }

    /// Add a signer's approval to an existing proposal.
    ///
    /// Emits a `signed` event for every signature collected (audit trail).
    pub fn sign(env: Env, signer: Address, proposal_id: String) -> Result<u32, ContractError> {
        Self::require_current_schema(&env)?;
        signer.require_auth();
        assert_is_signer(&env, &signer, SIGNERS_KEY)?;

        let mut proposals = Self::load_proposals(&env);
        let mut proposal = proposals
            .get(proposal_id.clone())
            .ok_or(ContractError::NotFound)?;

        if proposal.executed {
            return Err(ContractError::AlreadyProcessed);
        }
        if env.ledger().sequence() > proposal.expires_at {
            return Err(ContractError::Expired);
        }
        if proposal.signatures.contains(signer.clone()) {
            return Err(ContractError::InvalidInput);
        }

        proposal.signatures.push_back(signer.clone());
        let sig_count = proposal.signatures.len();

        proposals.set(proposal_id.clone(), proposal);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PROPOSALS_KEY), &proposals);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("signed"),), (proposal_id, signer, sig_count));
        Ok(sig_count)
    }

    /// Execute a proposal once the required threshold is met.
    ///
    /// Returns the approved value so the calling contract can act on it.
    pub fn execute(
        env: Env,
        executor: Address,
        proposal_id: String,
    ) -> Result<i128, ContractError> {
        Self::require_current_schema(&env)?;
        executor.require_auth();
        assert_is_signer(&env, &executor, SIGNERS_KEY)?;

        let mut proposals = Self::load_proposals(&env);
        let mut proposal = proposals
            .get(proposal_id.clone())
            .ok_or(ContractError::NotFound)?;

        if proposal.executed {
            return Err(ContractError::AlreadyProcessed);
        }
        if env.ledger().sequence() > proposal.expires_at {
            return Err(ContractError::Expired);
        }

        let (full_threshold, high_value_limit) = Self::stored_threshold_and_limit(&env)?;
        // Re-derive the threshold at execution time rather than trusting one from
        // proposal time: the signer set may have shrunk since.
        let live = Self::live_signature_count(&env, &proposal.signatures)?;
        verify_threshold(live, full_threshold, high_value_limit, proposal.value)?;

        let value = proposal.value;
        proposal.executed = true;
        let sig_count = proposal.signatures.len();
        proposals.set(proposal_id.clone(), proposal);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PROPOSALS_KEY), &proposals);
        Self::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("executed"),),
            (proposal_id, executor, value, sig_count),
        );
        Ok(value)
    }

    // ── Admin operations ─────────────────────────────────────────────────────

    /// Add a new signer. Admin only.
    pub fn add_signer(env: Env, admin: Address, new_signer: Address) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let mut signers = Self::load_signers(&env)?;
        if signers.contains(new_signer.clone()) {
            return Err(ContractError::InvalidInput);
        }
        if signers.len() >= MAX_SIGNERS {
            return Err(ContractError::InvalidInput);
        }

        signers.push_back(new_signer.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, SIGNERS_KEY), &signers);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("add_sgn"),), new_signer);
        Ok(())
    }

    /// Remove a signer. Admin only. Fails if removal would make quorum unreachable.
    pub fn remove_signer(env: Env, admin: Address, signer: Address) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let mut signers = Self::load_signers(&env)?;
        let threshold = Self::stored_threshold(&env)?;

        let index = signers
            .first_index_of(signer.clone())
            .ok_or(ContractError::NotFound)?;

        // Checked subtraction: the original `(signers.len() - 1) < threshold`
        // underflowed to u32::MAX on an empty set and let the check pass.
        let remaining = signers
            .len()
            .checked_sub(1)
            .ok_or(ContractError::InvalidInput)?;
        if remaining < threshold {
            return Err(ContractError::InvalidInput);
        }

        signers.remove(index);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, SIGNERS_KEY), &signers);
        Self::bump_instance_ttl(&env);

        env.events().publish((symbol_short!("rm_sgn"),), signer);
        Ok(())
    }

    /// Update the threshold. Admin only.
    pub fn set_threshold(
        env: Env,
        admin: Address,
        new_threshold: u32,
    ) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let signers = Self::load_signers(&env)?;
        if new_threshold == 0 || new_threshold > signers.len() {
            return Err(ContractError::InvalidInput);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, THRESHOLD_KEY), &new_threshold);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("set_thr"),), new_threshold);
        Ok(())
    }

    /// Update the high-value limit. Admin only.
    pub fn set_high_value_limit(
        env: Env,
        admin: Address,
        limit: i128,
    ) -> Result<(), ContractError> {
        Self::require_current_schema(&env)?;
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;
        require_non_negative_amount(limit)?;

        env.storage()
            .instance()
            .set(&Symbol::new(&env, HIGH_VALUE_LIMIT_KEY), &limit);
        Self::bump_instance_ttl(&env);

        env.events().publish((symbol_short!("set_hvl"),), limit);
        Ok(())
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Signatures required for a proposal of the given value.
    pub fn required_threshold(env: Env, value: i128) -> Result<u32, ContractError> {
        let (full_threshold, high_value_limit) = Self::stored_threshold_and_limit(&env)?;
        Ok(stellar_spend_shared::auth::required_threshold(
            full_threshold,
            high_value_limit,
            value,
        ))
    }

    /// Returns `(signature_count, threshold_required, is_executable)`.
    pub fn proposal_status(
        env: Env,
        proposal_id: String,
    ) -> Result<(u32, u32, bool), ContractError> {
        Self::require_current_schema(&env)?;
        let proposal = Self::load_proposals(&env)
            .get(proposal_id)
            .ok_or(ContractError::NotFound)?;

        let (full_threshold, high_value_limit) = Self::stored_threshold_and_limit(&env)?;
        let threshold = stellar_spend_shared::auth::required_threshold(
            full_threshold,
            high_value_limit,
            proposal.value,
        );
        let live = Self::live_signature_count(&env, &proposal.signatures)?;
        let expired = env.ledger().sequence() > proposal.expires_at;

        Ok((
            proposal.signatures.len(),
            threshold,
            live >= threshold && !proposal.executed && !expired,
        ))
    }

    pub fn get_proposal(env: Env, proposal_id: String) -> Result<Proposal, ContractError> {
        Self::require_current_schema(&env)?;
        Self::load_proposals(&env)
            .get(proposal_id)
            .ok_or(ContractError::NotFound)
    }

    pub fn get_signers(env: Env) -> Result<Vec<Address>, ContractError> {
        Self::require_current_schema(&env)?;
        Self::load_signers(&env)
    }

    pub fn get_threshold(env: Env) -> Result<u32, ContractError> {
        Self::require_current_schema(&env)?;
        Self::stored_threshold(&env)
    }

    // ── Upgrade surface (issue #817) ──────────────────────────────────────────

    pub fn schema_version(env: Env) -> Result<u32, ContractError> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, SCHEMA_KEY))
            .ok_or(ContractError::NotInitialized)
    }

    /// Replace the contract WASM. Admin only. Run `migrate` immediately after.
    ///
    /// Note this is an admin-key action, not a threshold-gated one; gating upgrades
    /// behind the multisig itself is tracked separately.
    pub fn upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.events().publish((symbol_short!("upgrade"),), ());
        Ok(())
    }

    /// Convert persisted state to [`SCHEMA_VERSION`]. Returns the version migrated from.
    pub fn migrate(env: Env, admin: Address) -> Result<u32, ContractError> {
        admin.require_auth();
        assert_is_admin(&env, &admin, ADMIN_KEY)?;

        let stored: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, SCHEMA_KEY))
            .ok_or(ContractError::NotInitialized)?;

        if stored == SCHEMA_VERSION {
            return Err(ContractError::SchemaAlreadyCurrent);
        }
        if stored > SCHEMA_VERSION {
            return Err(ContractError::SchemaVersionUnsupported);
        }

        if stored == 1 {
            // v1 -> v2: derive `expires_at` from the `created_at` the old build was
            // already recording, so in-flight proposals keep a meaningful deadline
            // instead of all expiring (or never expiring) at once.
            let old: Map<String, ProposalV1> = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, PROPOSALS_KEY))
                .unwrap_or_else(|| Map::new(&env));

            let mut migrated: Map<String, Proposal> = Map::new(&env);
            for (key, v1) in old.iter() {
                let expires_at = v1.created_at.saturating_add(DEFAULT_PROPOSAL_TTL_LEDGERS);
                migrated.set(
                    key,
                    Proposal {
                        id: v1.id,
                        description: v1.description,
                        target: v1.target,
                        value: v1.value,
                        signatures: v1.signatures,
                        executed: v1.executed,
                        created_at: v1.created_at,
                        expires_at,
                    },
                );
            }
            env.storage()
                .instance()
                .set(&Symbol::new(&env, PROPOSALS_KEY), &migrated);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, SCHEMA_KEY), &SCHEMA_VERSION);
        Self::bump_instance_ttl(&env);
        env.events()
            .publish((symbol_short!("migrate"),), (stored, SCHEMA_VERSION));
        Ok(stored)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn load_proposals(env: &Env) -> Map<String, Proposal> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, PROPOSALS_KEY))
            .unwrap_or_else(|| Map::new(env))
    }

    fn load_signers(env: &Env) -> Result<Vec<Address>, ContractError> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, SIGNERS_KEY))
            .ok_or(ContractError::NotInitialized)
    }

    fn stored_threshold(env: &Env) -> Result<u32, ContractError> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, THRESHOLD_KEY))
            .ok_or(ContractError::NotInitialized)
    }

    fn stored_threshold_and_limit(env: &Env) -> Result<(u32, i128), ContractError> {
        let threshold = Self::stored_threshold(env)?;
        let high_value_limit: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(env, HIGH_VALUE_LIMIT_KEY))
            .ok_or(ContractError::NotInitialized)?;
        Ok((threshold, high_value_limit))
    }

    /// How many of `signatures` belong to addresses that are still registered signers.
    fn live_signature_count(env: &Env, signatures: &Vec<Address>) -> Result<u32, ContractError> {
        let signers = Self::load_signers(env)?;
        let mut live = 0u32;
        for candidate in signatures.iter() {
            if signers.contains(candidate) {
                live += 1;
            }
        }
        Ok(live)
    }

    fn require_current_schema(env: &Env) -> Result<(), ContractError> {
        check_schema_version(
            env.storage().instance().get(&Symbol::new(env, SCHEMA_KEY)),
            SCHEMA_VERSION,
        )
    }

    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }
}

#[cfg(feature = "testutils")]
pub mod test_utils;

#[cfg(test)]
mod test;
