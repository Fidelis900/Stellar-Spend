/**
 * Wallet Adapter Pattern - Base interface for all wallet implementations
 */

export type WalletType = 'freighter' | 'lobstr' | 'custom';

export interface WalletAdapter {
  readonly type: WalletType;
  readonly name: string;
  readonly isAvailable: boolean;

  connect(): Promise<WalletConnection>;
  disconnect(): Promise<void>;
  signTransaction(xdr: string, opts: SignOptions): Promise<string>;
  getPublicKey(): Promise<string>;
}

export interface WalletConnection {
  publicKey: string;
  walletType: WalletType;
  isConnected: boolean;
}

export interface SignOptions {
  networkPassphrase: string;
}

export interface WalletError extends Error {
  code?: string;
  originalError?: unknown;
}

export class WalletConnectionError extends Error implements WalletError {
  code = 'WALLET_CONNECTION_ERROR';

  constructor(
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'WalletConnectionError';
  }
}

export class WalletSigningError extends Error implements WalletError {
  code = 'WALLET_SIGNING_ERROR';

  constructor(
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'WalletSigningError';
  }
}

export class WalletNotAvailableError extends Error implements WalletError {
  code = 'WALLET_NOT_AVAILABLE';

  constructor(walletType: WalletType) {
    super(`${walletType} wallet is not available`);
    this.name = 'WalletNotAvailableError';
  }
}
