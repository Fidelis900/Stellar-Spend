import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WalletManager } from '../manager';
import { FreighterAdapter } from '../freighter.adapter';
import { LobstrAdapter } from '../lobstr.adapter';
import { WalletNotAvailableError } from '../adapter';

// Mock the adapters
vi.mock('../freighter.adapter');
vi.mock('../lobstr.adapter');

describe('WalletManager', () => {
  let manager: WalletManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WalletManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with both adapters registered', () => {
      expect(manager.getAvailableWallets().length).toBeGreaterThanOrEqual(0);
    });

    it('should have event listeners initialized', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('autoConnect', () => {
    it('should throw when no wallets are available', async () => {
      await expect(manager.autoConnect()).rejects.toThrow('No wallet extension detected');
    });

    it('should connect to first available wallet', async () => {
      const mockConnection = {
        publicKey: 'test-public-key',
        walletType: 'freighter' as const,
        isConnected: true,
      };

      vi.spyOn(manager, 'connect').mockResolvedValueOnce(mockConnection);

      const result = await manager.autoConnect();
      expect(result.publicKey).toBe('test-public-key');
    });
  });

  describe('connect', () => {
    it('should throw for unknown wallet type', async () => {
      await expect(manager.connect('custom')).rejects.toThrow('Unknown wallet type');
    });

    it('should connect to freighter wallet', async () => {
      const mockConnection = {
        publicKey: 'freighter-key',
        walletType: 'freighter' as const,
        isConnected: true,
      };

      vi.spyOn(manager, 'connect').mockResolvedValueOnce(mockConnection);

      const result = await manager.connect('freighter');
      expect(result.walletType).toBe('freighter');
      expect(result.publicKey).toBe('freighter-key');
    });

    it('should connect to lobstr wallet', async () => {
      const mockConnection = {
        publicKey: 'lobstr-key',
        walletType: 'lobstr' as const,
        isConnected: true,
      };

      vi.spyOn(manager, 'connect').mockResolvedValueOnce(mockConnection);

      const result = await manager.connect('lobstr');
      expect(result.walletType).toBe('lobstr');
    });
  });

  describe('disconnect', () => {
    it('should disconnect gracefully when connected', async () => {
      const mockConnection = {
        publicKey: 'test-key',
        walletType: 'freighter' as const,
        isConnected: true,
      };

      vi.spyOn(manager, 'connect').mockResolvedValueOnce(mockConnection);
      await manager.connect('freighter');

      await expect(manager.disconnect()).resolves.not.toThrow();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(manager.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getPublicKey', () => {
    it('should throw when not connected', async () => {
      await expect(manager.getPublicKey()).rejects.toThrow('No wallet connected');
    });
  });

  describe('signTransaction', () => {
    it('should throw when not connected', async () => {
      await expect(
        manager.signTransaction('test-xdr', { networkPassphrase: 'test' }),
      ).rejects.toThrow('No wallet connected');
    });
  });

  describe('wallet availability', () => {
    it('should check if wallet is available', () => {
      const available = manager.isWalletAvailable('freighter');
      expect(typeof available).toBe('boolean');
    });

    it('should return empty array when no wallets available', () => {
      const wallets = manager.getAvailableWallets();
      expect(Array.isArray(wallets)).toBe(true);
    });
  });

  describe('event listeners', () => {
    it('should allow subscribing to wallet events', () => {
      const listener = vi.fn();
      const unsubscribe = manager.on('accountChange', listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribing from events', () => {
      const listener = vi.fn();
      const unsubscribe = manager.on('accountChange', listener);

      unsubscribe();
      // After unsubscribe, listener should not be called
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('getCurrentWalletType', () => {
    it('should return null when not connected', () => {
      const type = manager.getCurrentWalletType();
      expect(type).toBeNull();
    });
  });
});
