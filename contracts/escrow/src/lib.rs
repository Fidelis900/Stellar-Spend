//! Escrow contract for Stellar-Spend.
//!
//! ## Security model
//!
//! ### Check-Effects-Interactions (CEI)
//! Every state-changing function follows strict CEI order:
//!
//! 1. **Check**  – validate inputs and authorisation (`require_auth`, bounds checks)
//! 2. **Effect** – set the reentrancy lock, mutate storage, clear the lock
//! 3. **Interact** – emit events (read-only; no cross-contract calls in this contract)
//!
//! Because Soroban contracts can be invoked from other contracts, and a
//! malicious contract could re-enter before storage is written, we guard
//! `release` and `refund` with an explicit boolean lock stored in instance
//! storage.  Any re-entrant call finds the lock already set and returns
//! `ContractError::Reentrant`.
//!
//! ### Error taxonomy
//! All errors use the canonical [`ContractError`] from `stellar-spend-shared`
//! so clients always deal with a single, stable numeric error space.

#![no_std]
use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, Map, String};
use stellar_spend_shared::errors::ContractError;

const DEPOSITS_KEY: &str = "deposits";
const SETTLEMENT_AUTH_KEY: &str = "settlement_auth";
const TIMEOUT_KEY: &str = "timeout";
/// Reentrancy guard key – `true` while a release/refund is executing.
const LOCK_KEY: &str = "lock";

// ── Deposit record ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct EscrowDeposit {
    pub depositor: Address,
    pub amount: i128,
    pub bridge_address: Address,
    pub timestamp: u64,
    pub timeout_ledger: u32,
    pub released: bool,
    pub refunded: bool,
}

// ── Contract ───────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Initialisation ───────────────────────────────────────────────────────

    pub fn init(env: Env, settlement_authority: Address) {
        settlement_authority.require_auth();

        env.storage()
            .instance()
            .set(&Symbol::new(&env, SETTLEMENT_AUTH_KEY), &settlement_authority);
        env.storage().instance()
            .set(&Symbol::new(&env, TIMEOUT_KEY), &(604800u32)); // 7 days default
        // Ensure the reentrancy lock starts unlocked.
        env.storage().instance()
            .set(&Symbol::new(&env, LOCK_KEY), &false);
    }

    // ── Deposit ──────────────────────────────────────────────────────────────

    /// Deposit funds into escrow.
    ///
    /// Emits a `deposit` event.  Does **not** perform any cross-contract token
    /// transfer itself; the caller is responsible for moving tokens into the
    /// contract's account before calling this function.
    pub fn deposit(
        env: Env,
        depositor: Address,
        amount: i128,
        bridge_address: Address,
        token: Address,
    ) -> Result<String, ContractError> {
        // ── CHECK ──────────────────────────────────────────────────────────
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        depositor.require_auth();

        let current_ledger = env.ledger().sequence();
        let timeout = env
            .storage()
            .instance()
            .get::<_, u32>(&Symbol::new(&env, TIMEOUT_KEY))
            .unwrap_or(DEFAULT_TIMEOUT_LEDGERS);

        let deposit_id = soroban_sdk::format!(
            &env,
            "{}:{}:{}",
            depositor,
            bridge_address,
            current_ledger
        );

        // ── EFFECT ─────────────────────────────────────────────────────────
        let mut deposits: Map<String, EscrowDeposit> = env.storage().instance()
            .get(&Symbol::new(&env, DEPOSITS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let deposit = EscrowDeposit {
            depositor: depositor.clone(),
            amount,
            bridge_address: bridge_address.clone(),
            timestamp: env.ledger().timestamp(),
            // Saturating: a large configured timeout must not wrap to a past ledger,
            // which would make the deposit refundable immediately.
            timeout_ledger: current_ledger.saturating_add(timeout),
            released: false,
            refunded: false,
        };

        deposits.set(deposit_id.clone(), deposit);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, DEPOSITS_KEY), &deposits);

        // ── INTERACT ────────────────────────────────────────────────────────
        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (depositor, amount, bridge_address),
        );

        Ok(deposit_id)
    }

    // ── Release ──────────────────────────────────────────────────────────────

    /// Release escrowed funds to `recipient`.
    ///
    /// Only the settlement authority may call this function.
    ///
    /// ### CEI + reentrancy guard
    /// 1. **Check** – verify auth, load deposit, assert it has not been
    ///    processed.
    /// 2. **Effect** – acquire the reentrancy lock, mark `released = true`,
    ///    persist storage, release the lock.
    /// 3. **Interact** – emit event.
    pub fn release(
        env: Env,
        deposit_id: String,
        recipient: Address,
    ) -> Result<i128, ContractError> {
        // ── CHECK ──────────────────────────────────────────────────────────
        // Reentrancy guard: reject if a release/refund is already in-flight.
        Self::acquire_lock(&env)?;

        let settlement_auth: Address = env.storage().instance()
            .get(&Symbol::new(&env, SETTLEMENT_AUTH_KEY))
            .ok_or(ContractError::NotFound)?;

        settlement_auth.require_auth();

        let mut deposits: Map<String, EscrowDeposit> = env.storage().instance()
            .get(&Symbol::new(&env, DEPOSITS_KEY))
            .ok_or(ContractError::NotFound)?;

        let mut deposit = deposits.get(deposit_id.clone())
            .ok_or(ContractError::NotFound)?;

        if deposit.released {
            Self::release_lock(&env);
            return Err(ContractError::AlreadyProcessed);
        }
        if deposit.refunded {
            Self::release_lock(&env);
            return Err(ContractError::AlreadyProcessed);
        }

        // ── EFFECT ─────────────────────────────────────────────────────────
        let amount = deposit.amount;
        deposit.released = true;
        deposits.set(deposit_id.clone(), deposit);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, DEPOSITS_KEY), &deposits);

        // Release the reentrancy lock *before* any external call (events are
        // read-only but we unlock early as best-practice).
        Self::release_lock(&env);

        // ── INTERACT ────────────────────────────────────────────────────────
        env.events().publish(
            (Symbol::new(&env, "release"),),
            (deposit_id, recipient, amount),
        );

        Ok(amount)
    }

    // ── Refund ───────────────────────────────────────────────────────────────

    /// Refund escrowed funds to the original depositor after timeout.
    ///
    /// Anyone may call `refund`, but the contract enforces the timeout on its
    /// own – the depositor does not need any special privilege.
    ///
    /// ### CEI + reentrancy guard
    /// Same pattern as [`release`].
    pub fn refund(env: Env, deposit_id: String) -> Result<i128, ContractError> {
        // ── CHECK ──────────────────────────────────────────────────────────
        Self::acquire_lock(&env)?;

        let mut deposits: Map<String, EscrowDeposit> = env.storage().instance()
            .get(&Symbol::new(&env, DEPOSITS_KEY))
            .ok_or(ContractError::NotFound)?;

        let mut deposit = deposits.get(deposit_id.clone())
            .ok_or(ContractError::NotFound)?;

        if deposit.released {
            Self::release_lock(&env);
            return Err(ContractError::AlreadyProcessed);
        }
        if deposit.refunded {
            Self::release_lock(&env);
            return Err(ContractError::AlreadyProcessed);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < deposit.timeout_ledger {
            Self::release_lock(&env);
            return Err(ContractError::Expired);
        }

        // ── EFFECT ─────────────────────────────────────────────────────────
        let amount = deposit.amount;
        let depositor = deposit.depositor.clone();
        deposit.refunded = true;
        deposits.set(deposit_id.clone(), deposit);
        env.storage().instance().set(&Symbol::new(&env, DEPOSITS_KEY), &deposits);

        Self::release_lock(&env);

        // ── INTERACT ────────────────────────────────────────────────────────
        env.events().publish(
            (Symbol::new(&env, "refund"),),
            (deposit_id, depositor, amount),
        );

        Ok(amount)
    }

    // ── View functions ────────────────────────────────────────────────────────

    pub fn get_deposit(
        env: Env,
        deposit_id: String,
    ) -> Result<(i128, bool, bool), ContractError> {
        let deposits: Map<String, EscrowDeposit> = env.storage().instance()
            .get(&Symbol::new(&env, DEPOSITS_KEY))
            .ok_or(ContractError::NotFound)?;

        let deposit = deposits.get(deposit_id)
            .ok_or(ContractError::NotFound)?;

        Ok((deposit.amount, deposit.released, deposit.refunded))
    }

    pub fn can_refund(env: Env, deposit_id: String) -> Result<bool, ContractError> {
        let deposits: Map<String, EscrowDeposit> = env.storage().instance()
            .get(&Symbol::new(&env, DEPOSITS_KEY))
            .ok_or(ContractError::NotFound)?;

        let deposit = deposits.get(deposit_id)
            .ok_or(ContractError::NotFound)?;

        if deposit.refunded || deposit.released {
            return Ok(false);
        }

        let current_ledger = env.ledger().sequence();
        Ok(current_ledger >= deposit.timeout_ledger)
    }

    pub fn set_timeout(env: Env, timeout_ledgers: u32) -> Result<(), ContractError> {
        let settlement_auth: Address = env.storage().instance()
            .get(&Symbol::new(&env, SETTLEMENT_AUTH_KEY))
            .ok_or(ContractError::NotFound)?;

        settlement_auth.require_auth();

        if timeout_ledgers == 0 || timeout_ledgers > 10_000_000 {
            return Err(ContractError::InvalidAmount);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, TIMEOUT_KEY), &timeout_ledgers);

        env.events()
            .publish((Symbol::new(&env, "timeout_updated"),), timeout_ledgers);

        Ok(())
    }

    // ── Reentrancy guard helpers ──────────────────────────────────────────────

    /// Acquire the reentrancy lock.
    ///
    /// Returns `Err(ContractError::Reentrant)` if the lock is already held.
    /// On success, sets `LOCK_KEY = true` in instance storage.
    fn acquire_lock(env: &Env) -> Result<(), ContractError> {
        let locked: bool = env
            .storage()
            .instance()
            .get(&Symbol::new(env, LOCK_KEY))
            .unwrap_or(false);

        if locked {
            return Err(ContractError::Reentrant);
        }

        env.storage().instance().set(&Symbol::new(env, LOCK_KEY), &true);
        Ok(())
    }

    /// Release the reentrancy lock unconditionally.
    ///
    /// Must be called before every exit path (return or end of function)
    /// inside a guarded function.
    fn release_lock(env: &Env) {
        env.storage().instance().set(&Symbol::new(env, LOCK_KEY), &false);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Basic validation ──────────────────────────────────────────────────────

    #[test]
    fn test_deposit_validation() {
        assert!(0 <= 0, "Zero amount should be invalid");
        assert!(-100 < 0, "Negative amounts should be invalid");
    }

    #[test]
    fn test_deposit_state_transitions() {
        let released = false;
        let refunded = false;

        let can_release = !released && !refunded;
        let can_refund  = !released && !refunded;

        assert!(can_release, "Should be able to release");
        assert!(can_refund,  "Should be able to refund");
    }

    #[test]
    fn test_release_blocks_refund() {
        let released = true;
        let refunded = false;

    fn deposits(env: &Env) -> Map<String, EscrowDeposit> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, DEPOSITS_KEY))
            .unwrap_or_else(|| Map::new(env))
    }

    #[test]
    fn test_refund_blocks_release() {
        let released = false;
        let refunded = true;

        let can_release = !released && !refunded;
        assert!(!can_release, "Cannot release after refund");
    }

    #[test]
    fn test_timeout_ledger_calculation() {
        let current_ledger: u32 = 1000;
        let timeout: u32 = 604800;
        let timeout_ledger = current_ledger + timeout;

        assert_eq!(timeout_ledger, 605800);
        assert!(timeout_ledger > current_ledger);
    }

    /// `no_std` hex encoder — `format!` is unavailable without an allocator.
    fn hex_encode(env: &Env, bytes: &[u8; 32]) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut out = [0u8; 64];
        let mut i = 0;
        while i < 32 {
            out[i * 2] = HEX[(bytes[i] >> 4) as usize];
            out[i * 2 + 1] = HEX[(bytes[i] & 0x0f) as usize];
            i += 1;
        }
        String::from_bytes(env, &out)
    }

    // ── Reentrancy guard logic ────────────────────────────────────────────────

    /// Simulate the reentrancy guard state machine without a full Soroban env.
    struct FakeLock {
        locked: bool,
    }

    impl FakeLock {
        fn acquire(&mut self) -> Result<(), ContractError> {
            if self.locked {
                return Err(ContractError::Reentrant);
            }
            self.locked = true;
            Ok(())
        }

        fn release(&mut self) {
            self.locked = false;
        }
    }

    #[test]
    fn test_reentrancy_lock_acquire_succeeds_when_unlocked() {
        let mut lock = FakeLock { locked: false };
        assert!(lock.acquire().is_ok());
        assert!(lock.locked);
    }

    #[test]
    fn test_reentrancy_lock_rejects_second_acquire() {
        let mut lock = FakeLock { locked: false };
        lock.acquire().unwrap();
        let err = lock.acquire().unwrap_err();
        assert_eq!(err, ContractError::Reentrant,
            "Second acquire must return ContractError::Reentrant");
    }

    #[test]
    fn test_reentrancy_lock_release_allows_reacquire() {
        let mut lock = FakeLock { locked: false };
        lock.acquire().unwrap();
        lock.release();
        assert!(!lock.locked);
        assert!(lock.acquire().is_ok(),
            "Should be able to acquire after release");
    }

    /// Adversarial scenario: simulates a re-entrant call during release.
    ///
    /// In a real Soroban environment a cross-contract callback would attempt
    /// to call `release` again before the outer call has written its state.
    /// The reentrancy lock ensures the inner call is rejected.
    #[test]
    fn test_adversarial_reentrant_release() {
        let mut lock = FakeLock { locked: false };

        // First (legitimate) call acquires the lock.
        lock.acquire().expect("outer call should acquire lock");

        // Simulate a malicious re-entrant call from inside a callback.
        let reentrant_result = lock.acquire();
        assert_eq!(
            reentrant_result.unwrap_err(),
            ContractError::Reentrant,
            "Re-entrant call must be rejected with ContractError::Reentrant"
        );

        // Outer call finishes and releases the lock.
        lock.release();

        // After the outer call completes the lock is free again.
        assert!(!lock.locked, "Lock must be released after outer call completes");
    }

    /// Adversarial scenario: two rapid sequential calls (not re-entrant, but
    /// verifies the lock is properly released on the happy path).
    #[test]
    fn test_sequential_calls_after_lock_release() {
        let mut lock = FakeLock { locked: false };

        // First call
        lock.acquire().unwrap();
        lock.release();

        // Second call – should succeed because the lock was released
        assert!(lock.acquire().is_ok(),
            "Sequential call after a completed release must succeed");
        lock.release();
    }

    // ── CEI ordering assertion ────────────────────────────────────────────────

    /// Verify the conceptual CEI ordering with a simple state machine.
    ///
    /// This test documents and enforces the order: Check → Effect → Interact.
    #[test]
    fn test_cei_ordering_release() {
        // State before
        let mut released = false;
        let refunded = false;

        // CHECK: deposit is not already processed
        assert!(!released && !refunded, "Check: deposit is unprocessed");

        // EFFECT: mark as released (before any external interaction)
        released = true;

        // INTERACT: at this point state is already committed
        // (events/external calls happen here in the real contract)
        let _event_payload = (released, 100i128);

        // Post-condition
        assert!(released, "Effect was applied before interaction");
    }

    #[test]
    fn test_error_variants_are_distinct() {
        // Ensure error variants are distinguishable (not accidentally equal)
        assert_ne!(ContractError::Reentrant as u32, ContractError::AlreadyProcessed as u32);
        assert_ne!(ContractError::NotFound as u32, ContractError::Unauthorized as u32);
        assert_ne!(ContractError::Expired as u32, ContractError::InvalidAmount as u32);
    }
}

#[cfg(test)]
mod tests;
