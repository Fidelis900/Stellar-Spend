import * as freighterApi from '@stellar/freighter-api';

export type WalletType = 'freighter' | 'lobstr';

export interface StellarWallet {
  readonly type: WalletType;
  readonly publicKey: string;
  readonly isConnected: boolean;
}

// Mainnet passphrase — never changes.
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

// ── Error helpers ──────────────────────────────────────────────────────────────

function friendlyError(raw: unknown, fallback: string): Error {
  if (!raw) return new Error(fallback);
  if (typeof raw === 'object' && 'message' in raw) {
    const msg = String((raw as { message: unknown }).message ?? '');
    if (/user declined|rejected|denied/i.test(msg))
      return new Error(
        'Connection request was declined. Please approve it in your wallet and try again.',
      );
    if (/not connected|not installed/i.test(msg))
      return new Error(
        'Wallet extension is not installed or unavailable. Please install it and try again.',
      );
    if (/timeout/i.test(msg))
      return new Error('The wallet did not respond in time. Please try again.');
  }
  return new Error(fallback);
}

// ── Lobstr provider interface ──────────────────────────────────────────────────

interface LobstrProvider {
  connect(): Promise<{ publicKey: string }>;
  signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<{ signedXdr: string }>;
}

function resolveLobstrProvider(): LobstrProvider | null {
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

// ── Adapter ────────────────────────────────────────────────────────────────────

export class StellarWalletAdapter {
  private _walletType: WalletType | null = null;
  private _publicKey: string | null = null;

  // Serialises concurrent connection calls across connectAuto, connectFreighter, and connectLobstr.
  private _connectingPromise: Promise<StellarWallet> | null = null;

  // ── Availability checks ────────────────────────────────────────────────────

  /**
   * Returns true when the Freighter browser extension is present.
   */
  async isFreighterAvailable(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && (window as any).freighter) return true;
      const result = await freighterApi.isConnected();
      return !!result.isConnected;
    } catch {
      return false;
    }
  }

  /**
   * Returns true when a valid Lobstr provider is present on the window object.
   */
  isLobstrAvailable(): boolean {
    return resolveLobstrProvider() !== null;
  }

  // ── Connection methods ─────────────────────────────────────────────────────

  connectFreighter(): Promise<StellarWallet> {
    if (this._walletType === 'freighter' && this._publicKey) {
      return Promise.resolve({
        type: 'freighter',
        publicKey: this._publicKey,
        isConnected: true,
      });
    }
    if (this._connectingPromise) return this._connectingPromise;
    this._connectingPromise = this._doConnectFreighter().finally(() => {
      this._connectingPromise = null;
    });
    return this._connectingPromise;
  }

  private async _doConnectFreighter(): Promise<StellarWallet> {
    // Step 1 — extension presence check.
    const available = await this.isFreighterAvailable();
    if (!available) {
      throw new Error(
        'Freighter extension is not installed. Visit https://freighter.app to install it.',
      );
    }

    // Step 2 — network mismatch check.
    const networkDetails = await freighterApi.getNetworkDetails();
    if (!networkDetails.error) {
      const passphrase = networkDetails.networkPassphrase ?? '';
      if (passphrase && passphrase !== MAINNET_PASSPHRASE) {
        const networkName = networkDetails.network ?? passphrase;
        throw new Error(`Freighter is set to ${networkName}. Please switch to Mainnet.`);
      }
    }

    // Step 3 — check whether this origin is already connected/allowed.
    const connectedResult = await freighterApi.isConnected();
    if (connectedResult.error) {
      throw friendlyError(connectedResult.error, 'Could not reach Freighter. Please try again.');
    }

    const alreadyConnected = connectedResult.isConnected === true;

    // Step 4 — if already connected, attempt a silent address fetch first.
    if (alreadyConnected) {
      const addressResult = await freighterApi.getAddress();
      if (!addressResult.error && addressResult.address) {
        return this._store('freighter', addressResult.address);
      }
    }

    // Step 5 — request permission / unlock prompt.
    const accessResult = await freighterApi.requestAccess();
    if (accessResult.error) {
      throw friendlyError(accessResult.error, 'Freighter access was denied.');
    }

    if (accessResult.address) {
      return this._store('freighter', accessResult.address);
    }

    // If initial access didn't yield an address, try fetching it explicitly.
    const retryResult = await freighterApi.getAddress();
    if (retryResult.error) {
      throw friendlyError(
        retryResult.error,
        'Connected to Freighter but could not retrieve your public key. Please try again.',
      );
    }
    if (!retryResult.address) {
      throw new Error(
        'Connected to Freighter but no public key was returned. ' +
          'Ensure your wallet is unlocked and try again.',
      );
    }

    return this._store('freighter', retryResult.address);
  }

  // ── Lobstr connection ──────────────────────────────────────────────────────

  connectLobstr(): Promise<StellarWallet> {
    if (this._walletType === 'lobstr' && this._publicKey) {
      return Promise.resolve({
        type: 'lobstr',
        publicKey: this._publicKey,
        isConnected: true,
      });
    }
    if (this._connectingPromise) return this._connectingPromise;
    this._connectingPromise = this._doConnectLobstr().finally(() => {
      this._connectingPromise = null;
    });
    return this._connectingPromise;
  }

  private async _doConnectLobstr(): Promise<StellarWallet> {
    const provider = resolveLobstrProvider();
    if (!provider) {
      throw new Error(
        'Lobstr wallet is not installed or unavailable. ' +
          'Visit https://lobstr.co to install it.',
      );
    }

    let result: { publicKey: string };
    try {
      result = await provider.connect();
    } catch (err: unknown) {
      throw friendlyError(err, 'Failed to connect to Lobstr. Please try again.');
    }

    if (!result || typeof result !== 'object') {
      throw new Error('Lobstr returned an unexpected response. Please try again.');
    }

    const publicKey = (result as any).publicKey;
    if (typeof publicKey !== 'string' || publicKey.trim() === '') {
      throw new Error(
        'Lobstr did not return a valid public key. ' +
          'Ensure your wallet is unlocked and try again.',
      );
    }

    return this._store('lobstr', publicKey.trim());
  }

  // ── connectAuto ────────────────────────────────────────────────────────────

  /**
   * Attempts Freighter first. If unavailable, falls back to Lobstr.
   * Throws a clear error if neither wallet is present.
   */
  connectAuto(): Promise<StellarWallet> {
    if (this._walletType && this._publicKey) {
      return Promise.resolve({
        type: this._walletType,
        publicKey: this._publicKey,
        isConnected: true,
      });
    }

    if (this._connectingPromise) return this._connectingPromise;

    this._connectingPromise = this._doConnectAuto().finally(() => {
      this._connectingPromise = null;
    });
    return this._connectingPromise;
  }

  private async _doConnectAuto(): Promise<StellarWallet> {
    // Try Freighter first.
    if (await this.isFreighterAvailable()) {
      return this._doConnectFreighter();
    }

    // Fall back to Lobstr.
    if (this.isLobstrAvailable()) {
      return this._doConnectLobstr();
    }

    throw new Error(
      'No Stellar wallet found. Please install Freighter (https://freighter.app) ' +
        'or Lobstr (https://lobstr.co).',
    );
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  async signTransaction(xdr: string): Promise<string> {
    if (!this._walletType || !this._publicKey) {
      throw new Error('No wallet connected. Please connect your wallet first.');
    }

    if (this._walletType === 'freighter') {
      return this._signWithFreighter(xdr);
    }

    return this._signWithLobstr(xdr);
  }

  private async _signWithFreighter(xdr: string): Promise<string> {
    const { signedTxXdr, error } = await freighterApi.signTransaction(xdr, {
      networkPassphrase: MAINNET_PASSPHRASE,
    });

    if (error) {
      throw friendlyError(error, 'Freighter signing failed. Please try again.');
    }

    if (!signedTxXdr) {
      throw new Error('Freighter returned an empty signed transaction.');
    }

    return signedTxXdr;
  }

  private async _signWithLobstr(xdr: string): Promise<string> {
    const provider = resolveLobstrProvider();
    if (!provider) {
      throw new Error('Lobstr is no longer available. Please reconnect your wallet.');
    }

    let signResult: { signedXdr: string };
    try {
      signResult = await provider.signTransaction(xdr, {
        networkPassphrase: MAINNET_PASSPHRASE,
      });
    } catch (err: unknown) {
      throw friendlyError(err, 'Lobstr signing failed. Please try again.');
    }

    if (!signResult?.signedXdr) {
      throw new Error('Lobstr returned an empty signed transaction. Please try again.');
    }
    return signResult.signedXdr;
  }

  // ── State accessors ────────────────────────────────────────────────────────

  getWallet(): StellarWallet | null {
    if (!this._walletType || !this._publicKey) return null;
    return { type: this._walletType, publicKey: this._publicKey, isConnected: true };
  }

  disconnect(): void {
    this._walletType = null;
    this._publicKey = null;
    this._connectingPromise = null;
  }

  private _store(type: WalletType, publicKey: string): StellarWallet {
    this._walletType = type;
    this._publicKey = publicKey;
    return { type, publicKey, isConnected: true };
  }
}

let _adapter: StellarWalletAdapter | null = null;

/**
 * Returns the singleton StellarWalletAdapter instance.
 */
export function getStellarWalletAdapter(): StellarWalletAdapter {
  if (!_adapter) _adapter = new StellarWalletAdapter();
  return _adapter;
}

export function _resetAdapterSingleton(): void {
  _adapter = null;
}
