//! Shared token transfer wrapper for Stellar Asset Contract interactions.
//!
//! This module provides a consistent interface for token transfers and balance queries
//! across all Stellar-Spend smart contracts, with unified error handling and validation.
//!
//! Wraps [`soroban_sdk::token::TokenClient`] rather than hand-rolling
//! `env.invoke_contract` calls: the client's `try_*` methods already know the SAC's
//! argument encoding, so callers here only need to map its `Result` onto
//! [`ContractError`].

use soroban_sdk::{token::TokenClient, Address, Env};

use crate::errors::ContractError;

/// Transfer `amount` from `from` to `to` via the Stellar Asset Contract at `token`.
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(ContractError::InvalidAmount)` if `amount <= 0`
/// * `Err(ContractError::ContractFault)` if the token call itself fails
///   (insufficient balance, `from` did not authorize, `token` is not a valid
///   token contract, etc.)
///
/// # Safety
/// Caller is responsible for verifying `token` is a valid Stellar Asset Contract
/// address and that `from`'s authorization covers this transfer.
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

    TokenClient::new(env, token)
        .try_transfer(from, to, &amount)
        .map_err(|_| ContractError::ContractFault)?
        .map_err(|_| ContractError::ContractFault)
}

/// Fetch the balance of `account` for `token`.
///
/// # Returns
/// * `Ok(balance)` in the token's smallest unit
/// * `Err(ContractError::ContractFault)` if the token call fails
pub fn balance(env: &Env, token: &Address, account: &Address) -> Result<i128, ContractError> {
    TokenClient::new(env, token)
        .try_balance(account)
        .map_err(|_| ContractError::ContractFault)?
        .map_err(|_| ContractError::ContractFault)
}

/// Approve `spender` to transfer up to `amount` of `token` from `owner`.
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(ContractError::InvalidAmount)` if `amount < 0`
/// * `Err(ContractError::ContractFault)` if the token call fails
///
/// # Note
/// The Stellar Asset Contract's `approve` follows ERC-20 semantics: a prior
/// allowance is replaced, not incremented.
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

    TokenClient::new(env, token)
        .try_approve(owner, spender, &amount, &expiration_ledger)
        .map_err(|_| ContractError::ContractFault)?
        .map_err(|_| ContractError::ContractFault)
}

/// Check the current allowance `owner` has granted to `spender` for `token`.
///
/// # Returns
/// * `Ok(amount)` — the current allowance
/// * `Err(ContractError::ContractFault)` if the token call fails
pub fn allowance(
    env: &Env,
    token: &Address,
    owner: &Address,
    spender: &Address,
) -> Result<i128, ContractError> {
    TokenClient::new(env, token)
        .try_allowance(owner, spender)
        .map_err(|_| ContractError::ContractFault)?
        .map_err(|_| ContractError::ContractFault)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn transfer_rejects_zero_and_negative_amounts_without_a_token_call() {
        let env = Env::default();
        let token = Address::generate(&env);
        let from = Address::generate(&env);
        let to = Address::generate(&env);

        // No token contract is registered at `token`; if these reached the
        // TokenClient call they would panic on a missing contract instead of
        // returning cleanly, so success here proves the amount check runs first.
        assert_eq!(
            transfer(&env, &token, &from, &to, 0),
            Err(ContractError::InvalidAmount)
        );
        assert_eq!(
            transfer(&env, &token, &from, &to, -1),
            Err(ContractError::InvalidAmount)
        );
    }

    #[test]
    fn approve_rejects_negative_amount_without_a_token_call() {
        let env = Env::default();
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let spender = Address::generate(&env);

        assert_eq!(
            approve(&env, &token, &owner, &spender, -1, 1000),
            Err(ContractError::InvalidAmount)
        );
    }
}
