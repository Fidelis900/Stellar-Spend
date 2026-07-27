//! Shared test fixtures for the treasury contract (issue #818).

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, Map,
};

use crate::{DataKey, TreasuryContract, TreasuryContractClient, SCHEMA_VERSION};

/// Ledger sequence every fixture starts at.
pub const START_LEDGER: u32 = 1_000;

/// Entry TTL the fixture configures, with headroom past any jump these tests make.
pub const FIXTURE_ENTRY_TTL: u32 = 12_000_000;

pub struct TreasuryTest {
    pub env: Env,
    pub contract_id: Address,
    pub admin: Address,
    pub treasury: Address,
    /// A non-admin address, for authorisation tests.
    pub outsider: Address,
}

impl TreasuryTest {
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

        let contract_id = env.register(TreasuryContract, ());
        Self {
            admin: Address::generate(&env),
            treasury: Address::generate(&env),
            outsider: Address::generate(&env),
            contract_id,
            env,
        }
    }

    /// Register and `init` with the default fee schedule.
    pub fn setup() -> Self {
        let fixture = Self::registered();
        fixture.client().init(&fixture.admin, &fixture.treasury);
        fixture
    }

    pub fn client(&self) -> TreasuryContractClient<'_> {
        TreasuryContractClient::new(&self.env, &self.contract_id)
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

    /// Build a fee schedule map in this fixture's env.
    pub fn schedule(&self, tiers: &[(i128, u32)]) -> Map<i128, u32> {
        let mut map: Map<i128, u32> = Map::new(&self.env);
        for (threshold, basis_points) in tiers {
            map.set(*threshold, *basis_points);
        }
        map
    }

    /// Replace the stored fee schedule wholesale, bypassing per-tier validation.
    ///
    /// Lets tests set up schedules that the public API would reject (an empty one,
    /// for instance) in order to pin the read-path's behaviour against them.
    pub fn force_schedule(&self, tiers: &[(i128, u32)]) {
        let schedule = self.schedule(tiers);
        self.env.as_contract(&self.contract_id, || {
            self.env
                .storage()
                .instance()
                .set(&DataKey::FeeSchedule, &schedule);
        });
    }
}

// ── Schema-upgrade harness (issue #817) ──────────────────────────────────────

impl TreasuryTest {
    /// Overwrite instance storage with a **schema v1** layout.
    ///
    /// v1 held admin, treasury and the fee schedule but no `TotalCollected` counter.
    /// The key is explicitly removed so the migration is tested against an absent
    /// entry rather than a zero-valued one.
    pub fn seed_v1_state(&self, tiers: &[(i128, u32)]) {
        let schedule = self.schedule(tiers);
        self.env.as_contract(&self.contract_id, || {
            let storage = self.env.storage().instance();
            storage.set(&DataKey::Admin, &self.admin);
            storage.set(&DataKey::Treasury, &self.treasury);
            storage.set(&DataKey::FeeSchedule, &schedule);
            storage.remove(&DataKey::TotalCollected);
            storage.set(&DataKey::Schema, &1u32);
        });
    }

    /// A fixture carrying un-migrated v1 state with the historical default tiers.
    pub fn with_legacy_v1_state() -> Self {
        let fixture = Self::registered();
        fixture.seed_v1_state(&[(0, 50), (1_000_000, 25), (10_000_000, 10)]);
        fixture
    }

    /// Whether the `TotalCollected` key exists at all.
    pub fn has_total_collected_key(&self) -> bool {
        self.env.as_contract(&self.contract_id, || {
            self.env.storage().instance().has(&DataKey::TotalCollected)
        })
    }

    /// Fee schedule read straight out of storage.
    pub fn stored_schedule(&self) -> Map<i128, u32> {
        self.read_storage(&DataKey::FeeSchedule)
            .expect("fee schedule missing")
    }
}

/// Assert a freshly-initialised contract records the current schema version.
pub fn assert_fresh_init_is_current(fixture: &TreasuryTest) {
    assert_eq!(
        fixture.stored_schema(),
        Some(SCHEMA_VERSION),
        "init must persist the current schema version"
    );
}
