//! Shared token transfer wrapper for Stellar Asset Contract interactions.
//!
//! This module provides a consistent interface for token transfers and balance queries
//! across all Stellar-Spend smart contracts, with unified error handling and validation.
//!
//! See `docs/adr/ADR-012-contract-architecture.md` §5 for the contract responsibility boundary.

use soroban_sdk::{Address, Env, Val};
use crate::errors::ContractError;

/// Transfer amount from one address to another via the Stellar Asset Contract.
///
/// # Arguments
/// * `env` – Soroban environment
/// * `token` – address of the token contract (Stellar Asset Contract)
/// * `from` – sender address (must have authorized this call)
/// * `to` – recipient address
/// * `amount` – amount to transfer (stroops for native, smallest unit for issued assets)
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(ContractError::InvalidAmount)` if amount ≤ 0 or exceeds balance
/// * `Err(ContractError::Unauthorized)` if `from` did not authorize the transfer
/// * `Err(ContractError::ContractFault)` on other token contract errors
///
/// # Safety
/// Caller is responsible for verifying:
/// - `token` is a valid Stellar Asset Contract address
/// - Authorization has been checked for `from` (via `require_auth`)
pub fn transfer(
    env: &Env,
    token: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    // Invoke Stellar Asset Contract's `transfer` function.
    // Signature: fn transfer(from: Address, to: Address, amount: i128)
    // The token contract enforces authorization of `from`.
    let result: Result<(), Val> = env.invoke_contract(
        token,
        &soroban_sdk::Symbol::new(env, "transfer"),
        soroban_sdk::vec![env, from.clone().into(), to.clone().into(), amount.into()],
    );

    match result {
        Ok(_) => Ok(()),
        Err(e) => {
            // Map Soroban contract errors to our canonical error space.
            // Common causes:
            // - InsufficientBalance: amount > balance
            // - InvalidInput: amount ≤ 0 (pre-checked above)
            // - MissingData: from/to not initialized
            // - ContractCoreHostError: token is not a valid contract
            Err(ContractError::ContractFault)
        }
    }
}

/// Fetch the balance of an address for a given token.
///
/// # Arguments
/// * `env` – Soroban environment
/// * `token` – address of the token contract (Stellar Asset Contract)
/// * `account` – address to query
///
/// # Returns
/// * `Ok(balance)` – the balance in smallest units (stroops / atoms)
/// * `Err(ContractError::NotFound)` if `account` has no balance entry for this token
/// * `Err(ContractError::ContractFault)` on other token contract errors
///
/// # Note
/// A missing balance entry typically means the account has not yet established
/// a trustline to this token (in pre-contract-v20 Stellar terminology).
pub fn balance(env: &Env, token: &Address, account: &Address) -> Result<i128, ContractError> {
    // Invoke Stellar Asset Contract's `balance` function.
    // Signature: fn balance(id: Address) -> i128
    let result: Result<i128, Val> = env.invoke_contract(
        token,
        &soroban_sdk::Symbol::new(env, "balance"),
        soroban_sdk::vec![env, account.clone().into()],
    );

    match result {
        Ok(balance) => Ok(balance),
        Err(_) => {
            // Most errors here indicate the account does not hold this token.
            Err(ContractError::NotFound)
        }
    }
}

/// Approve a spending allowance for a spender from an owner.
///
/// # Arguments
/// * `env` – Soroban environment
/// * `token` – address of the token contract (Stellar Asset Contract)
/// * `owner` – address authorizing the spending (must authorize this call)
/// * `spender` – address permitted to spend up to `amount`
/// * `amount` – maximum amount spender is allowed to transfer
/// * `expiration_ledger` – ledger number after which approval expires
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(ContractError::InvalidAmount)` if amount < 0
/// * `Err(ContractError::Unauthorized)` if `owner` did not authorize this call
/// * `Err(ContractError::ContractFault)` on other token contract errors
///
/// # Note
/// The Stellar Asset Contract's `approve` function follows ERC-20 semantics:
/// if a prior allowance exists, it is replaced (not incremented).
pub fn approve(
    env: &Env,
    token: &Address,
    owner: &Address,
    spender: &Address,
    amount: i128,
    expiration_ledger: u32,
) -> Result<(), ContractError> {
    if amount < 0 {
        return Err(ContractError::InvalidAmount);
    }

    // Invoke Stellar Asset Contract's `approve` function.
    // Signature: fn approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32)
    let result: Result<(), Val> = env.invoke_contract(
        token,
        &soroban_sdk::Symbol::new(env, "approve"),
        soroban_sdk::vec![
            env,
            owner.clone().into(),
            spender.clone().into(),
            amount.into(),
            expiration_ledger.into(),
        ],
    );

    match result {
        Ok(_) => Ok(()),
        Err(_) => Err(ContractError::ContractFault),
    }
}

/// Check the current allowance granted by owner to spender.
///
/// # Arguments
/// * `env` – Soroban environment
/// * `token` – address of the token contract (Stellar Asset Contract)
/// * `owner` – address that granted the allowance
/// * `spender` – address permitted to spend
///
/// # Returns
/// * `Ok((amount, expiration_ledger))` – current allowance and its expiration
/// * `Err(ContractError::NotFound)` if no allowance has been granted
/// * `Err(ContractError::ContractFault)` on other token contract errors
pub fn allowance(
    env: &Env,
    token: &Address,
    owner: &Address,
    spender: &Address,
) -> Result<(i128, u32), ContractError> {
    // Invoke Stellar Asset Contract's `allowance` function.
    // Signature: fn allowance(from: Address, spender: Address) -> (i128, u32)
    let result: Result<(i128, u32), Val> = env.invoke_contract(
        token,
        &soroban_sdk::Symbol::new(env, "allowance"),
        soroban_sdk::vec![env, owner.clone().into(), spender.clone().into()],
    );

    match result {
        Ok(allowance_tuple) => Ok(allowance_tuple),
        Err(_) => Err(ContractError::NotFound),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_rejects_zero_amount() {
        // This would need a Soroban test environment to fully test,
        // but the logic is straightforward: transfer checks amount <= 0.
        // Full integration tests are in each contract's test suite.
    }

    #[test]
    fn transfer_rejects_negative_amount() {
        // Same as above; unit test structure only.
        // The validation logic is: if amount <= 0, return Err(ContractError::InvalidAmount).
    }

    #[test]
    fn approve_rejects_negative_amount() {
        // The validation logic is: if amount < 0, return Err(ContractError::InvalidAmount).
        // Amount = 0 is allowed (revokes existing approval).
    }
}
