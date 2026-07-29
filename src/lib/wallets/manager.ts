import { logger } from '@/lib/logger';
/**
 * Wallet Manager - Handles wallet switching and auto-detection
 */

import { WalletAdapter, WalletType, WalletConnection, SignOptions } from './adapter';
import { FreighterAdapter } from './freighter.adapter';
import { LobstrAdapter } from './lobstr.adapter';

export type WalletEventType = 'accountChange' | 'disconnect' | 'networkChange';
export type WalletEventListener = (event: WalletEvent) => void;

export interface WalletEvent {
  type: WalletEventType;
  walletType: WalletType;
  data?: Record<string, unknown>;
}

export class WalletManager {
  private adapters: Map<WalletType, WalletAdapter> = new Map();
  private currentAdapter: WalletAdapter | null = null;
  private eventListeners: Map<WalletEventType, Set<WalletEventListener>> = new Map();

  constructor() {
    this.registerAdapter(new FreighterAdapter());
    this.registerAdapter(new LobstrAdapter());
    this.initializeEventListeners();
  }

  private registerAdapter(adapter: WalletAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  private initializeEventListeners(): void {
    this.eventListeners.set('accountChange', new Set());
    this.eventListeners.set('disconnect', new Set());
    this.eventListeners.set('networkChange', new Set());
  }

  /**
   * Subscribe to wallet events
   */
  on(eventType: WalletEventType, listener: WalletEventListener): () => void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.add(listener);
      // Return unsubscribe function
      return () => listeners.delete(listener);
    }
    return () => {};
  }

  /**
   * Emit wallet events
   */
  private emit(event: WalletEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          logger.error(`Error in wallet event listener for ${event.type}:`, {}, err);
        }
      });
    }
  }

  /**
   * Auto-detect and connect to the first available wallet
   */
  async autoConnect(): Promise<WalletConnection> {
    for (const [, adapter] of this.adapters) {
      if (adapter.isAvailable) {
        return this.connect(adapter.type);
      }
    }
    throw new Error('No wallet extension detected. Please install Freighter or Lobstr.');
  }

  /**
   * Connect to a specific wallet type
   */
  async connect(walletType: WalletType): Promise<WalletConnection> {
    const adapter = this.adapters.get(walletType);
    if (!adapter) {
      throw new Error(`Unknown wallet type: ${walletType}`);
    }

    const connection = await adapter.connect();
    this.currentAdapter = adapter;
    this.setupWalletListeners(walletType);
    return connection;
  }

  /**
   * Setup event listeners for wallet changes
   */
  private setupWalletListeners(walletType: WalletType): void {
    if (typeof window === 'undefined') return;

    if (walletType === 'freighter') {
      const w = window as any;
      if (w.freighter) {
        try {
          w.freighter.addEventListener('publicKeyChange', () => {
            this.emit({
              type: 'accountChange',
              walletType: 'freighter',
            });
          });
        } catch (err) {
          logger.error('Failed to setup Freighter listener:', {}, err);
        }
      }
    } else if (walletType === 'lobstr') {
      const w = window as any;
      const provider = w.lobstr ?? w.stellar;
      if (provider) {
        try {
          provider.addEventListener('accountChange', () => {
            this.emit({
              type: 'accountChange',
              walletType: 'lobstr',
            });
          });
        } catch (err) {
          logger.error('Failed to setup Lobstr listener:', {}, err);
        }
      }
    }
  }

  /**
   * Disconnect from current wallet
   */
  async disconnect(): Promise<void> {
    if (this.currentAdapter) {
      await this.currentAdapter.disconnect();
      this.currentAdapter = null;
    }
  }

  /**
   * Sign a transaction with the current wallet
   */
  async signTransaction(xdr: string, opts: SignOptions): Promise<string> {
    if (!this.currentAdapter) {
      throw new Error('No wallet connected. Please connect first.');
    }
    return this.currentAdapter.signTransaction(xdr, opts);
  }

  /**
   * Get the public key of the current wallet
   */
  async getPublicKey(): Promise<string> {
    if (!this.currentAdapter) {
      throw new Error('No wallet connected. Please connect first.');
    }
    return this.currentAdapter.getPublicKey();
  }

  /**
   * Get the current wallet type
   */
  getCurrentWalletType(): WalletType | null {
    return this.currentAdapter?.type ?? null;
  }

  /**
   * Check if a wallet type is available
   */
  isWalletAvailable(walletType: WalletType): boolean {
    const adapter = this.adapters.get(walletType);
    return adapter?.isAvailable ?? false;
  }

  /**
   * Get all available wallets
   */
  getAvailableWallets(): WalletAdapter[] {
    return Array.from(this.adapters.values()).filter((adapter) => adapter.isAvailable);
  }
}

export const walletManager = new WalletManager();
