/**
 * Stellar module exports
 */

export type { WalletType, StellarWallet } from './wallet-adapter';
export { StellarWalletAdapter, getStellarWalletAdapter } from './wallet-adapter';
export { SorobanEventIndexer } from './event-indexer';
export type { SorobanEvent, IndexerState } from './event-indexer';
export {
  createMultiSigTransaction,
  addPartialSignature,
  pruneExpiredSignatures,
  getMultiSigStatus,
  getMultiSigStatusCode,
  getPendingSigners,
  validateMultiSigConfig,
  removeMultiSigTransaction,
} from './multisig';
export type {
  MultiSigSigner,
  MultiSigConfig,
  PartialSignature,
  MultiSigTransactionStatus,
  MultiSigStatusCode,
} from './multisig';
export { ResourceFeeEstimator } from './resource-fee-estimator';
