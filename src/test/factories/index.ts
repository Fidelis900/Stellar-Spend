/**
 * Test data factories — single import point.
 *
 * Usage:
 *   import {
 *     seed,
 *     makeTransaction, completedTransaction, pendingTransaction, failedTransaction,
 *     makeQuote,
 *     makeBeneficiary,
 *     makeUser,
 *   } from '@/test/factories';
 */

// RNG
export { createRng, getDefaultRng, resetDefaultRng, type Rng } from './rng';

// Seeding
export { seed, seedWith } from './seed';

// Factories
export {
  makeTransaction,
  makeTransactions,
  pendingTransaction,
  completedTransaction,
  failedTransaction,
  transactionWithBridge,
  resetTransactionCounter,
  makeStellarAddress,
  makeBaseAddress,
  makeStellarTxHash,
} from './transaction.factory';

export { makeQuote, makeQuoteForCurrency, makeQuotes, type QuoteResponse } from './quote.factory';

export {
  makeBeneficiary,
  makeBeneficiaryForCurrency,
  resetBeneficiaryCounter,
  type Beneficiary,
} from './beneficiary.factory';

export { makeUser, makeUsers, resetUserCounter, type User } from './user.factory';

export {
  makeMultisigProposal,
  makeMultisigSignature,
  pendingMultisigProposal,
  executedMultisigProposal,
  expiredMultisigProposal,
  partiallySignedMultisigProposal,
  makeMultisigProposals,
  makeMultisigSignatures,
  resetMultisigSettlementCounters,
  type MultisigProposal,
  type MultisigSignature,
} from './multisig-settlement.factory';
