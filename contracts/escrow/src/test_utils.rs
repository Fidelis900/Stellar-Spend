//! Shared test fixtures for the escrow contract.
//!
//! Compiled only under the `testutils` feature, which the crate enables for itself
//! via a dev-dependency so that both `src/test.rs` and `tests/*.rs` can use it.
//!
//! Every escrow test previously repeated the same four lines of `Env` construction,
//! address generation, registration and `init`. [`EscrowTest::setup`] replaces that;
//! use [`EscrowTest::registered`] when a test needs to observe pre-`init` behaviour.

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, Map,
};

use crate::{
    DataKey, EscrowContract, EscrowContractClient, EscrowDeposit, EscrowDepositV1,
    DEFAULT_TIMEOUT_LEDGERS, SCHEMA_VERSION,
};

/// Ledger sequence every fixture starts at.
///
/// Non-zero so that tests can assert on `timeout_ledger` arithmetic without zero
/// masking an ordering bug, and low enough that adding `MAX_TIMEOUT_LEDGERS` to it
/// stays far from `u32::MAX`.
pub const START_LEDGER: u32 = 1_000;

/// Entry TTL the default fixture configures.
///
/// Tests routinely jump `DEFAULT_TIMEOUT_LEDGERS` (604,800) or, in the timeout-bound
/// cases, `MAX_TIMEOUT_LEDGERS` (10,000,000) ahead. The host archives instance
/// storage once its TTL lapses and then fails every call with a bare
/// `Storage, InternalError`, which reads as an unrelated bug. Giving fixtures
/// headroom past the largest jump keeps failures attributable to the contract.
pub const FIXTURE_ENTRY_TTL: u32 = 12_000_000;

/// A registered escrow contract plus the cast of addresses tests need.
///
/// Holds the `Env` and contract id rather than a client, because the generated
/// client borrows the `Env`; call [`EscrowTest::client`] to get one on demand.
pub struct EscrowTest {
    pub env: Env,
    pub contract_id: Address,
    /// Settlement authority.
    pub admin: Address,
    pub depositor: Address,
    pub bridge: Address,
    /// A second depositor, for tests that need two independent parties.
    pub other: Address,
}

impl EscrowTest {
    /// Register the contract without calling `init`.
    ///
    /// Auth is mocked. The ledger is positioned at [`START_LEDGER`] with
    /// [`FIXTURE_ENTRY_TTL`] of entry lifetime.
    pub fn registered() -> Self {
        Self::registered_at(START_LEDGER, FIXTURE_ENTRY_TTL)
    }

    /// Register the contract at an explicit ledger sequence and entry TTL.
    ///
    /// Needed by tests that probe ledger-arithmetic bounds, where the sequence must
    /// sit near `u32::MAX` and the TTL must therefore be small enough that
    /// `sequence + ttl` does not itself overflow.
    pub fn registered_at(sequence: u32, entry_ttl: u32) -> Self {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| {
            li.sequence_number = sequence;
            li.min_persistent_entry_ttl = entry_ttl;
            li.min_temp_entry_ttl = entry_ttl;
            li.max_entry_ttl = entry_ttl;
        });

        let contract_id = env.register(EscrowContract, ());
        Self {
            admin: Address::generate(&env),
            depositor: Address::generate(&env),
            bridge: Address::generate(&env),
            other: Address::generate(&env),
            contract_id,
            env,
        }
    }

    /// Register and `init` the contract. The common starting point.
    pub fn setup() -> Self {
        let fixture = Self::registered();
        fixture.client().init(&fixture.admin);
        fixture
    }

    /// A client bound to this fixture's env and contract.
    pub fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract_id)
    }

    /// Create a deposit from the fixture's default depositor and bridge.
    ///
    /// Returns the new deposit id.
    pub fn deposit(&self, amount: i128) -> u64 {
        self.client()
            .deposit(&self.depositor, &amount, &self.bridge, &0u32)
    }

    /// Create a deposit with an explicit fee quote.
    pub fn deposit_with_fee(&self, amount: i128, fee_bps: u32) -> u64 {
        self.client()
            .deposit(&self.depositor, &amount, &self.bridge, &fee_bps)
    }

    /// Move the ledger sequence forward by `n`.
    pub fn advance_ledgers(&self, n: u32) {
        self.env.ledger().with_mut(|li| li.sequence_number += n);
    }

    /// Move past the default refund timeout so `refund` is permitted.
    pub fn advance_past_timeout(&self) {
        self.advance_ledgers(DEFAULT_TIMEOUT_LEDGERS + 1);
    }

    /// Read a raw instance-storage value from inside the contract's context.
    ///
    /// Lets upgrade tests inspect state that no entrypoint exposes.
    pub fn read_storage<V>(&self, key: &DataKey) -> Option<V>
    where
        V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>,
    {
        self.env
            .as_contract(&self.contract_id, || self.env.storage().instance().get(key))
    }

    /// Current schema version as recorded in storage.
    pub fn stored_schema(&self) -> Option<u32> {
        self.read_storage(&DataKey::Schema)
    }

    /// Deposit map decoded as the current (v2) layout.
    pub fn deposits_v2(&self) -> Map<u64, EscrowDeposit> {
        self.read_storage(&DataKey::Deposits)
            .expect("deposits entry missing")
    }
}

// ── Schema-upgrade harness (issue #817) ──────────────────────────────────────

/// Builds a deposit record in the **v1** shape.
///
/// Kept as a free function so upgrade tests can express "this is what the old build
/// wrote" without depending on the current struct's field list.
pub fn v1_deposit(
    depositor: &Address,
    bridge: &Address,
    amount: i128,
    timeout_ledger: u32,
    released: bool,
    refunded: bool,
) -> EscrowDepositV1 {
    EscrowDepositV1 {
        depositor: depositor.clone(),
        amount,
        bridge_address: bridge.clone(),
        timestamp: 0,
        timeout_ledger,
        released,
        refunded,
    }
}

impl EscrowTest {
    /// Overwrite instance storage with a **schema v1** layout.
    ///
    /// This is the core of the upgrade harness: it reproduces exactly what a v1
    /// build would have persisted — a `Map<u64, EscrowDepositV1>` under
    /// [`DataKey::Deposits`] and a `Schema` of `1` — so that `migrate` can be
    /// exercised against genuinely old-shaped bytes rather than a v2 record with a
    /// field blanked out.
    ///
    /// Writes go through `env.as_contract` so they land in the contract's own
    /// storage footprint, the same place a real deployed instance would hold them.
    pub fn seed_v1_state(&self, records: &[(u64, EscrowDepositV1)]) {
        self.env.as_contract(&self.contract_id, || {
            let mut deposits: Map<u64, EscrowDepositV1> = Map::new(&self.env);
            let mut highest_id = 0u64;
            for (id, record) in records {
                deposits.set(*id, record.clone());
                if *id >= highest_id {
                    highest_id = *id + 1;
                }
            }

            let storage = self.env.storage().instance();
            storage.set(&DataKey::Admin, &self.admin);
            storage.set(&DataKey::Timeout, &DEFAULT_TIMEOUT_LEDGERS);
            storage.set(&DataKey::Deposits, &deposits);
            storage.set(&DataKey::NextId, &highest_id);
            // The v1 marker is what makes `migrate` take the upgrade path.
            storage.set(&DataKey::Schema, &1u32);
        });
    }

    /// Deposit map decoded as the **v1** layout, for asserting pre-migration state.
    ///
    /// Panics if the stored bytes are not v1-shaped, which is itself the assertion:
    /// a successful decode proves the seeded state really is the old layout.
    pub fn deposits_v1(&self) -> Map<u64, EscrowDepositV1> {
        self.read_storage(&DataKey::Deposits)
            .expect("deposits entry missing or not v1-shaped")
    }

    /// A fixture seeded with v1 state and left un-migrated.
    ///
    /// Shorthand for the most common upgrade-test opening: an "old" deployment
    /// carrying two deposits, one already released.
    pub fn with_legacy_v1_state() -> Self {
        let fixture = Self::registered();
        let timeout = START_LEDGER + DEFAULT_TIMEOUT_LEDGERS;
        fixture.seed_v1_state(&[
            (
                0,
                v1_deposit(
                    &fixture.depositor,
                    &fixture.bridge,
                    5_000,
                    timeout,
                    false,
                    false,
                ),
            ),
            (
                1,
                v1_deposit(&fixture.other, &fixture.bridge, 9_100, timeout, true, false),
            ),
        ]);
        fixture
    }
}

/// Assert that the current schema constant matches what a freshly-initialised
/// contract writes. Guards against bumping [`SCHEMA_VERSION`] without updating `init`.
pub fn assert_fresh_init_is_current(fixture: &EscrowTest) {
    assert_eq!(
        fixture.stored_schema(),
        Some(SCHEMA_VERSION),
        "init must persist the current schema version"
    );
}
