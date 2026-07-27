//! Shared test fixtures for the fee-manager contract.
//!
//! Mirrors the shape of `escrow::test_utils` so that moving between contract test
//! suites does not mean learning a new setup convention (issue #818).

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

use crate::{DataKey, FeeManagerContract, FeeManagerContractClient, SCHEMA_VERSION};

/// Ledger sequence every fixture starts at.
pub const START_LEDGER: u32 = 1_000;

/// Entry TTL the fixture configures, with headroom past any jump these tests make.
pub const FIXTURE_ENTRY_TTL: u32 = 12_000_000;

/// Fee rate fixtures initialise with, in basis points (0.5%).
pub const DEFAULT_TEST_FEE_BP: u32 = 50;

pub struct FeeManagerTest {
    pub env: Env,
    pub contract_id: Address,
    pub admin: Address,
    /// A non-admin address, for authorisation tests.
    pub outsider: Address,
}

impl FeeManagerTest {
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

        let contract_id = env.register(FeeManagerContract, ());
        Self {
            admin: Address::generate(&env),
            outsider: Address::generate(&env),
            contract_id,
            env,
        }
    }

    /// Register and `init` at [`DEFAULT_TEST_FEE_BP`].
    pub fn setup() -> Self {
        let fixture = Self::registered();
        fixture.client().init(&fixture.admin, &DEFAULT_TEST_FEE_BP);
        fixture
    }

    /// Register, `init`, and trip the circuit breaker.
    pub fn setup_paused() -> Self {
        let fixture = Self::setup();
        fixture.client().pause(&fixture.reason("incident"));
        fixture
    }

    pub fn client(&self) -> FeeManagerContractClient<'_> {
        FeeManagerContractClient::new(&self.env, &self.contract_id)
    }

    /// Build a `String` in this fixture's env, for `pause` reasons.
    pub fn reason(&self, text: &str) -> String {
        String::from_str(&self.env, text)
    }

    /// Read a raw instance-storage value from inside the contract's context.
    pub fn read_storage<V>(&self, key: &DataKey) -> Option<V>
    where
        V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>,
    {
        self.env
            .as_contract(&self.contract_id, || self.env.storage().instance().get(key))
    }

    pub fn stored_schema(&self) -> Option<u32> {
        self.read_storage(&DataKey::Schema)
    }
}

// ── Schema-upgrade harness (issue #817) ──────────────────────────────────────

impl FeeManagerTest {
    /// Overwrite instance storage with a **schema v1** layout.
    ///
    /// v1 stored only `Admin` and `Paused`; there was no `DefaultRate` key. Seeding
    /// means writing exactly those keys and deliberately *omitting* `DefaultRate`, so
    /// the migration is tested against a genuinely absent entry rather than a
    /// zero-valued one.
    pub fn seed_v1_state(&self, paused: bool) {
        self.env.as_contract(&self.contract_id, || {
            let storage = self.env.storage().instance();
            storage.set(&DataKey::Admin, &self.admin);
            storage.set(&DataKey::Paused, &paused);
            storage.remove(&DataKey::DefaultRate);
            storage.set(&DataKey::Schema, &1u32);
        });
    }

    /// A fixture carrying un-migrated v1 state.
    pub fn with_legacy_v1_state() -> Self {
        let fixture = Self::registered();
        fixture.seed_v1_state(false);
        fixture
    }

    /// Whether the `DefaultRate` key exists at all.
    ///
    /// Distinguishes "absent" from "present and zero", which is the difference
    /// between a v1 layout and a migrated one.
    pub fn has_default_rate_key(&self) -> bool {
        self.env.as_contract(&self.contract_id, || {
            self.env.storage().instance().has(&DataKey::DefaultRate)
        })
    }
}

/// Assert a freshly-initialised contract records the current schema version.
pub fn assert_fresh_init_is_current(fixture: &FeeManagerTest) {
    assert_eq!(
        fixture.stored_schema(),
        Some(SCHEMA_VERSION),
        "init must persist the current schema version"
    );
}
