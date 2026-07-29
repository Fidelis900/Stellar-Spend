/**
 * Lobstr Wallet Adapter
 */

import {
  WalletAdapter,
  WalletConnection,
  SignOptions,
  WalletConnectionError,
  WalletSigningError,
  WalletNotAvailableError,
} from './adapter';

interface LobstrProvider {
  connect(): Promise<{ publicKey: string }>;
  signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<{ signedXdr: string }>;
}

export class LobstrAdapter implements WalletAdapter {
  readonly type = 'lobstr' as const;
  readonly name = 'Lobstr';
  private publicKey: string | null = null;
  private provider: LobstrProvider | null = null;

  get isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    return this.resolveLobstrProvider() !== null;
  }

  async connect(): Promise<WalletConnection> {
    if (!this.isAvailable) {
      throw new WalletNotAvailableError('lobstr');
    }

    try {
      const provider = this.resolveLobstrProvider();
      if (!provider) throw new Error('Lobstr provider not found');

      const result = await provider.connect();
      this.publicKey = result.publicKey;
      this.provider = provider;

      return {
        publicKey: result.publicKey,
        walletType: 'lobstr',
        isConnected: true,
      };
    } catch (error) {
      throw new WalletConnectionError(
        this.friendlyError(error, 'Failed to connect to Lobstr wallet'),
        error,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.publicKey = null;
    this.provider = null;
  }

  async signTransaction(xdr: string, opts: SignOptions): Promise<string> {
    if (!this.publicKey || !this.provider) {
      throw new WalletSigningError('Wallet not connected. Please connect first.');
    }

    try {
      const result = await this.provider.signTransaction(xdr, {
        networkPassphrase: opts.networkPassphrase,
      });
      return result.signedXdr;
    } catch (error) {
      throw new WalletSigningError(
        this.friendlyError(error, 'Failed to sign transaction with Lobstr'),
        error,
      );
    }
  }

  async getPublicKey(): Promise<string> {
    if (!this.publicKey) {
      const provider = this.resolveLobstrProvider();
      if (!provider) throw new WalletNotAvailableError('lobstr');
      const result = await provider.connect();
      this.publicKey = result.publicKey;
      this.provider = provider;
    }
    return this.publicKey;
  }

  private resolveLobstrProvider(): LobstrProvider | null {
    if (typeof window === 'undefined') return null;
    const w = window as any;
    const candidate: unknown = w.lobstr ?? (w.stellar?.isLobstr ? w.stellar : null);
    if (!candidate || typeof candidate !== 'object') return null;
    if (
      typeof (candidate as any).connect !== 'function' ||
      typeof (candidate as any).signTransaction !== 'function'
    ) {
      return null;
    }
    return candidate as LobstrProvider;
  }

  private friendlyError(raw: unknown, fallback: string): string {
    if (!raw) return fallback;
    if (typeof raw === 'object' && 'message' in raw) {
      const msg = String((raw as { message: unknown }).message ?? '');
      if (/user declined|rejected|denied/i.test(msg))
        return 'Connection request was declined. Please approve it in your wallet and try again.';
      if (/not connected|not installed/i.test(msg))
        return 'Lobstr wallet is not installed or unavailable. Please install it and try again.';
      if (/timeout/i.test(msg)) return 'The wallet did not respond in time. Please try again.';
      if (/locked/i.test(msg)) return 'Lobstr wallet is locked. Please unlock it.';
      if (/invalid.*network|wrong.*network/i.test(msg))
        return 'Wrong network selected. Please switch networks in Lobstr.';
    }
    return fallback;
  }
}
