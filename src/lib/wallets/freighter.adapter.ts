/**
 * Freighter Wallet Adapter
 */

import * as freighterApi from '@stellar/freighter-api';
import {
  WalletAdapter,
  WalletConnection,
  SignOptions,
  WalletConnectionError,
  WalletSigningError,
  WalletNotAvailableError,
} from './adapter';

export class FreighterAdapter implements WalletAdapter {
  readonly type = 'freighter' as const;
  readonly name = 'Freighter';
  private publicKey: string | null = null;

  get isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return freighterApi.isConnected();
    } catch {
      return false;
    }
  }

  async connect(): Promise<WalletConnection> {
    if (!this.isAvailable) {
      throw new WalletNotAvailableError('freighter');
    }

    try {
      const publicKey = await freighterApi.getPublicKey();
      this.publicKey = publicKey;
      return {
        publicKey,
        walletType: 'freighter',
        isConnected: true,
      };
    } catch (error) {
      throw new WalletConnectionError(
        this.friendlyError(error, 'Failed to connect to Freighter wallet'),
        error,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.publicKey = null;
  }

  async signTransaction(xdr: string, opts: SignOptions): Promise<string> {
    if (!this.publicKey) {
      throw new WalletSigningError('Wallet not connected. Please connect first.');
    }

    try {
      const result = await freighterApi.signTransaction(xdr, {
        networkPassphrase: opts.networkPassphrase,
      });
      return result;
    } catch (error) {
      throw new WalletSigningError(
        this.friendlyError(error, 'Failed to sign transaction with Freighter'),
        error,
      );
    }
  }

  async getPublicKey(): Promise<string> {
    if (!this.publicKey) {
      const key = await freighterApi.getPublicKey();
      this.publicKey = key;
    }
    return this.publicKey;
  }

  private friendlyError(raw: unknown, fallback: string): string {
    if (!raw) return fallback;
    if (typeof raw === 'object' && 'message' in raw) {
      const msg = String((raw as { message: unknown }).message ?? '');
      if (/user declined|rejected|denied/i.test(msg))
        return 'Connection request was declined. Please approve it in your wallet and try again.';
      if (/not connected|not installed/i.test(msg))
        return 'Freighter extension is not installed or unavailable. Please install it and try again.';
      if (/timeout/i.test(msg)) return 'The wallet did not respond in time. Please try again.';
      if (/testnet|mainnet/i.test(msg))
        return 'Freighter is set to Testnet. Please switch to Mainnet.';
      if (/locked/i.test(msg)) return 'Freighter wallet is locked. Please unlock it.';
      if (/invalid.*network|wrong.*network/i.test(msg))
        return 'Wrong network selected. Please switch networks in Freighter.';
    }
    return fallback;
  }
}
