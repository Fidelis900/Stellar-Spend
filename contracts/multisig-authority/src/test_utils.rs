//! Shared test fixtures for the multisig-authority contract (issue #818).

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, Map, String, Symbol, Vec,
};

use crate::{
    MultisigAuthority, MultisigAuthorityClient, ProposalV1, DEFAULT_PROPOSAL_TTL_LEDGERS,
    HIGH_VALUE_LIMIT_KEY, PROPOSALS_KEY, SCHEMA_KEY, SCHEMA_VERSION, SIGNERS_KEY, THRESHOLD_KEY,
};

/// Ledger sequence every fixture starts at.
pub const START_LEDGER: u32 = 1_000;

/// Entry TTL the fixture configures, with headroom past any jump these tests make.
pub const FIXTURE_ENTRY_TTL: u32 = 12_000_000;

/// Threshold the default fixture initialises with (2-of-3).
pub const DEFAULT_THRESHOLD: u32 = 2;
/// High-value limit the default fixture initialises with.
pub const DEFAULT_HIGH_VALUE_LIMIT: i128 = 1_000;

pub struct MultisigTest {
    pub env: Env,
    pub contract_id: Address,
    pub admin: Address,
    pub signers: Vec<Address>,
    /// A registered address that is not a signer, for authorisation tests.
    pub outsider: Address,
}

impl MultisigTest {
    /// Register the contract without calling `init`.
    pub fn registered() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| {
            li.sequence_number = START_LEDGER;
            li.min_persistent_entry_ttl = FIXTURE_ENTRY_TTL;
            li.min_temp_entry_ttl = FIXTURE_ENTRY_TTL;
            li.max_entry_ttl = FIXTURE_ENTRY_TTL;
        });

        let contract_id = env.register(MultisigAuthority, ());
        let signers = Vec::from_array(
            &env,
            [
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
            ],
        );

        Self {
            admin: Address::generate(&env),
            outsider: Address::generate(&env),
            signers,
            contract_id,
            env,
        }
    }

    /// Register and `init` with 3 signers, a 2-of-3 threshold, and
    /// [`DEFAULT_HIGH_VALUE_LIMIT`].
    pub fn setup() -> Self {
        let fixture = Self::registered();
        fixture.client().init(
            &fixture.admin,
            &fixture.signers,
            &DEFAULT_THRESHOLD,
            &DEFAULT_HIGH_VALUE_LIMIT,
        );
        fixture
    }

    pub fn client(&self) -> MultisigAuthorityClient<'_> {
        MultisigAuthorityClient::new(&self.env, &self.contract_id)
    }

    pub fn signer(&self, index: usize) -> Address {
        self.signers.get(index as u32).unwrap()
    }

    /// Build a proposal id string in this fixture's env.
    pub fn id(&self, text: &str) -> String {
        String::from_str(&self.env, text)
    }

    /// Propose a low-value action (at or below the default high-value limit) from
    /// `signer(0)`, needing only one signature to execute.
    pub fn propose_low_value(&self, id: &str, target: &Address) -> String {
        let proposal_id = self.id(id);
        self.client().propose(
            &self.signer(0),
            &proposal_id,
            &self.id("low value action"),
            target,
            &(DEFAULT_HIGH_VALUE_LIMIT / 2),
        );
        proposal_id
    }

    /// Propose a high-value action (above the default high-value limit) from
    /// `signer(0)`, needing the full threshold to execute.
    pub fn propose_high_value(&self, id: &str, target: &Address) -> String {
        let proposal_id = self.id(id);
        self.client().propose(
            &self.signer(0),
            &proposal_id,
            &self.id("high value action"),
            target,
            &(DEFAULT_HIGH_VALUE_LIMIT * 10),
        );
        proposal_id
    }

    pub fn advance_ledgers(&self, n: u32) {
        self.env.ledger().with_mut(|li| li.sequence_number += n);
    }

    /// Move past a proposal's expiry so it can no longer be signed or executed.
    pub fn advance_past_proposal_expiry(&self) {
        self.advance_ledgers(DEFAULT_PROPOSAL_TTL_LEDGERS + 1);
    }

    /// Read a raw instance-storage value from inside the contract's context.
    pub fn read_storage<V>(&self, key: &Symbol) -> Option<V>
    where
        V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>,
    {
        self.env
            .as_contract(&self.contract_id, || self.env.storage().instance().get(key))
    }

    pub fn stored_schema(&self) -> Option<u32> {
        self.read_storage(&Symbol::new(&self.env, SCHEMA_KEY))
    }
}

// ── Schema-upgrade harness (issue #817) ──────────────────────────────────────

impl MultisigTest {
    /// Overwrite instance storage with a **schema v1** layout: same admin/signers/
    /// threshold/high-value-limit, but proposals stored as [`ProposalV1`] (no
    /// `expires_at`).
    pub fn seed_v1_state(&self, proposals: &[(String, ProposalV1)]) {
        let mut map: Map<String, ProposalV1> = Map::new(&self.env);
        for (id, proposal) in proposals {
            map.set(id.clone(), proposal.clone());
        }

        self.env.as_contract(&self.contract_id, || {
            let storage = self.env.storage().instance();
            storage.set(&Symbol::new(&self.env, "admin"), &self.admin);
            storage.set(&Symbol::new(&self.env, SIGNERS_KEY), &self.signers);
            storage.set(&Symbol::new(&self.env, THRESHOLD_KEY), &DEFAULT_THRESHOLD);
            storage.set(
                &Symbol::new(&self.env, HIGH_VALUE_LIMIT_KEY),
                &DEFAULT_HIGH_VALUE_LIMIT,
            );
            storage.set(&Symbol::new(&self.env, PROPOSALS_KEY), &map);
            storage.set(&Symbol::new(&self.env, SCHEMA_KEY), &1u32);
        });
    }

    /// A fixture carrying a single un-migrated, unexecuted v1 proposal created at
    /// [`START_LEDGER`].
    pub fn with_legacy_v1_state(&self, target: &Address) -> String {
        let id = self.id("legacy-1");
        let v1 = ProposalV1 {
            id: id.clone(),
            description: self.id("legacy action"),
            target: target.clone(),
            value: DEFAULT_HIGH_VALUE_LIMIT * 10,
            signatures: Vec::from_array(&self.env, [self.signer(0)]),
            executed: false,
            created_at: START_LEDGER,
        };
        self.seed_v1_state(&[(id.clone(), v1)]);
        id
    }

    /// Deposit-style shorthand: a fresh fixture already seeded with legacy state.
    pub fn registered_with_legacy_v1_state() -> (Self, String, Address) {
        let fixture = Self::registered();
        let target = Address::generate(&fixture.env);
        let id = fixture.with_legacy_v1_state(&target);
        (fixture, id, target)
    }
}

/// Assert a freshly-initialised contract records the current schema version.
pub fn assert_fresh_init_is_current(fixture: &MultisigTest) {
    assert_eq!(
        fixture.stored_schema(),
        Some(SCHEMA_VERSION),
        "init must persist the current schema version"
    );
}
