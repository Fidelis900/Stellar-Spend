//! Time-locked escrow custody for Stellar-Spend off-ramp deposits.
//!
//! Trust model and refund guarantee: see `docs/adr/ADR-008-soroban-escrow-trust-model.md`.
//! Responsibility boundary: see `docs/adr/ADR-012-contract-architecture.md`.
//!
//! Per ADR-012 §5 this contract tracks custody *state* only; it does not move tokens.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, xdr::ToXdr, Address, Bytes, Env, Map,
    String, Symbol,
};

const DEPOSITS_KEY: &str = "deposits";
const SETTLEMENT_AUTH_KEY: &str = "settlement_auth";
const TIMEOUT_KEY: &str = "timeout";
/// Monotonic counter guaranteeing deposit-ID uniqueness within a single ledger.
const DEPOSIT_SEQ_KEY: &str = "deposit_seq";

/// Default refund timeout, in ledgers (~7 days at 5s/ledger).
const DEFAULT_TIMEOUT_LEDGERS: u32 = 604_800;
const MAX_TIMEOUT_LEDGERS: u32 = 10_000_000;

/// Error codes for `escrow`, reserved range 1–99.
/// See `docs/error-codes.md` § Soroban Contract Errors.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidAmount = 3,
    DepositNotFound = 4,
    AlreadyReleased = 5,
    AlreadyRefunded = 6,
    TimeoutNotReached = 7,
    InvalidTimeout = 8,
}

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

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialise the escrow with its settlement authority.
    ///
    /// Guarded against re-initialisation: without the guard any caller could
    /// re-`init` with an address they control and take over `release`/`set_timeout`.
    pub fn init(env: Env, settlement_authority: Address) -> Result<(), Error> {
        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, SETTLEMENT_AUTH_KEY))
        {
            return Err(Error::AlreadyInitialized);
        }
        settlement_authority.require_auth();

        env.storage()
            .instance()
            .set(&Symbol::new(&env, SETTLEMENT_AUTH_KEY), &settlement_authority);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, TIMEOUT_KEY), &DEFAULT_TIMEOUT_LEDGERS);
        Ok(())
    }

    pub fn deposit(
        env: Env,
        depositor: Address,
        amount: i128,
        bridge_address: Address,
        token: Address,
    ) -> Result<String, Error> {
        // ADR-012 §5: `token` is recorded in the ABI but no transfer happens on-chain.
        let _ = token;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        depositor.require_auth();

        let current_ledger = env.ledger().sequence();
        let timeout = env
            .storage()
            .instance()
            .get::<_, u32>(&Symbol::new(&env, TIMEOUT_KEY))
            .unwrap_or(DEFAULT_TIMEOUT_LEDGERS);

        let deposit_id = Self::next_deposit_id(&env, &depositor, &bridge_address, current_ledger);

        let mut deposits: Map<String, EscrowDeposit> = env
            .storage()
            .instance()
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

        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (depositor, amount, bridge_address),
        );

        Ok(deposit_id)
    }

    /// Release a deposit to `recipient`. Settlement-authority only.
    pub fn release(env: Env, deposit_id: String, recipient: Address) -> Result<i128, Error> {
        let settlement_auth = Self::settlement_authority(&env)?;
        settlement_auth.require_auth();

        let mut deposits = Self::deposits(&env);
        let mut deposit = deposits
            .get(deposit_id.clone())
            .ok_or(Error::DepositNotFound)?;

        if deposit.released {
            return Err(Error::AlreadyReleased);
        }
        if deposit.refunded {
            return Err(Error::AlreadyRefunded);
        }

        let amount = deposit.amount;
        deposit.released = true;

        deposits.set(deposit_id.clone(), deposit);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, DEPOSITS_KEY), &deposits);

        env.events().publish(
            (Symbol::new(&env, "release"),),
            (deposit_id, recipient, amount),
        );

        Ok(amount)
    }

    /// Refund a timed-out deposit to its original depositor.
    ///
    /// **Intentionally permissionless** (ADR-012 §2): this is the user's guaranteed
    /// exit path when the settlement authority is unavailable. Funds are credited to
    /// the recorded `depositor`, so an arbitrary caller cannot redirect them — it can
    /// only trigger the refund on the depositor's behalf, and only after the timeout.
    /// Do not add `require_auth()` here without superseding ADR-008.
    pub fn refund(env: Env, deposit_id: String) -> Result<i128, Error> {
        let mut deposits = Self::deposits(&env);
        let mut deposit = deposits
            .get(deposit_id.clone())
            .ok_or(Error::DepositNotFound)?;

        if deposit.released {
            return Err(Error::AlreadyReleased);
        }
        if deposit.refunded {
            return Err(Error::AlreadyRefunded);
        }

        if env.ledger().sequence() < deposit.timeout_ledger {
            return Err(Error::TimeoutNotReached);
        }

        let amount = deposit.amount;
        deposit.refunded = true;

        deposits.set(deposit_id.clone(), deposit.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, DEPOSITS_KEY), &deposits);

        env.events().publish(
            (Symbol::new(&env, "refund"),),
            (deposit_id, deposit.depositor, amount),
        );

        Ok(amount)
    }

    pub fn get_deposit(env: Env, deposit_id: String) -> Result<(i128, bool, bool), Error> {
        let deposit = Self::deposits(&env)
            .get(deposit_id)
            .ok_or(Error::DepositNotFound)?;
        Ok((deposit.amount, deposit.released, deposit.refunded))
    }

    /// Update the refund timeout. Settlement-authority only.
    ///
    /// Only affects deposits created *after* the change; existing deposits keep the
    /// `timeout_ledger` stamped at creation, so the authority cannot retroactively
    /// extend a user's lock-up.
    pub fn set_timeout(env: Env, timeout_ledgers: u32) -> Result<(), Error> {
        let settlement_auth = Self::settlement_authority(&env)?;
        settlement_auth.require_auth();

        if timeout_ledgers == 0 || timeout_ledgers > MAX_TIMEOUT_LEDGERS {
            return Err(Error::InvalidTimeout);
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, TIMEOUT_KEY), &timeout_ledgers);

        env.events()
            .publish((Symbol::new(&env, "timeout_updated"),), timeout_ledgers);

        Ok(())
    }

    pub fn can_refund(env: Env, deposit_id: String) -> Result<bool, Error> {
        let deposit = Self::deposits(&env)
            .get(deposit_id)
            .ok_or(Error::DepositNotFound)?;

        if deposit.refunded || deposit.released {
            return Ok(false);
        }
        Ok(env.ledger().sequence() >= deposit.timeout_ledger)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn deposits(env: &Env) -> Map<String, EscrowDeposit> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, DEPOSITS_KEY))
            .unwrap_or_else(|| Map::new(env))
    }

    fn settlement_authority(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&Symbol::new(env, SETTLEMENT_AUTH_KEY))
            .ok_or(Error::NotInitialized)
    }

    /// Deterministic, collision-free deposit ID: hex(sha256(depositor ‖ bridge ‖ ledger ‖ seq)).
    ///
    /// The monotonic `seq` is what guarantees uniqueness — without it two deposits
    /// from the same depositor to the same bridge in one ledger would collide and
    /// the second would silently overwrite the first.
    fn next_deposit_id(
        env: &Env,
        depositor: &Address,
        bridge_address: &Address,
        current_ledger: u32,
    ) -> String {
        let seq_key = Symbol::new(env, DEPOSIT_SEQ_KEY);
        let seq: u64 = env.storage().instance().get(&seq_key).unwrap_or(0u64) + 1;
        env.storage().instance().set(&seq_key, &seq);

        let mut preimage: Bytes = depositor.clone().to_xdr(env);
        preimage.append(&bridge_address.clone().to_xdr(env));
        preimage.extend_from_slice(&current_ledger.to_be_bytes());
        preimage.extend_from_slice(&seq.to_be_bytes());

        Self::hex_encode(env, &env.crypto().sha256(&preimage).to_array())
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
}

#[cfg(test)]
mod tests;
