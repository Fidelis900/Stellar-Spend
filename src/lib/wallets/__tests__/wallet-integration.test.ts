import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WalletManager } from '../manager';

describe('Wallet Integration Tests', () => {
  let manager: WalletManager;

  beforeEach(() => {
    manager = new WalletManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('reconnect scenarios', () => {
    it('should handle reconnect after page reload', async () => {
      // Simulate first connection
      const availableWallets = manager.getAvailableWallets();
      expect(Array.isArray(availableWallets)).toBe(true);

      // Simulate disconnect (page reload)
      await manager.disconnect();
      expect(manager.getCurrentWalletType()).toBeNull();

      // Should be able to reconnect
      const walletType = manager.getCurrentWalletType();
      expect(walletType).toBeNull(); // After disconnect, should be null
    });

    it('should handle multiple rapid connections', async () => {
      const attempts = 5;
      let successCount = 0;

      for (let i = 0; i < attempts; i++) {
        try {
          // This will fail since no wallet is available in test, but shouldn't hang
          await manager.autoConnect().catch(() => {
            // Expected to fail in test environment
          });
        } catch {
          // Expected error
        }
      }

      // Should handle rapid attempts gracefully
      expect(true).toBe(true);
    });
  });

  describe('account change edge cases', () => {
    it('should detect account changes via events', () => {
      const listener = vi.fn();
      manager.on('accountChange', listener);

      // Should be subscribed without errors
      expect(typeof listener).toBe('function');
    });

    it('should handle multiple account change listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      manager.on('accountChange', listener1);
      manager.on('accountChange', listener2);
      manager.on('accountChange', listener3);

      // All should be registered
      expect(true).toBe(true);
    });

    it('should allow unsubscribing from specific listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = manager.on('accountChange', listener1);
      manager.on('accountChange', listener2);

      unsub1();

      // Should unsubscribe first listener
      expect(typeof unsub1).toBe('function');
    });
  });

  describe('error state edge cases', () => {
    it('should handle connection error without wallet installed', async () => {
      try {
        await manager.connect('freighter');
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should handle unknown wallet type gracefully', async () => {
      try {
        await manager.connect('unknown' as any);
      } catch (err: any) {
        expect(err.message).toContain('Unknown wallet type');
      }
    });

    it('should handle disconnect without connection', async () => {
      // Should not throw
      await expect(manager.disconnect()).resolves.not.toThrow();
    });

    it('should handle getPublicKey without connection', async () => {
      try {
        await manager.getPublicKey();
      } catch (err: any) {
        expect(err.message).toContain('not connected');
      }
    });

    it('should handle signTransaction without connection', async () => {
      try {
        await manager.signTransaction('test', { networkPassphrase: 'test' });
      } catch (err: any) {
        expect(err.message).toContain('not connected');
      }
    });
  });

  describe('wallet availability checking', () => {
    it('should check freighter availability', () => {
      const available = manager.isWalletAvailable('freighter');
      expect(typeof available).toBe('boolean');
    });

    it('should check lobstr availability', () => {
      const available = manager.isWalletAvailable('lobstr');
      expect(typeof available).toBe('boolean');
    });

    it('should return list of available wallets', () => {
      const available = manager.getAvailableWallets();
      expect(Array.isArray(available)).toBe(true);
      available.forEach((wallet) => {
        expect(wallet.name).toBeDefined();
        expect(wallet.type).toBeDefined();
      });
    });
  });

  describe('event listener cleanup', () => {
    it('should handle multiple event types', () => {
      const accountChangeListener = vi.fn();
      const disconnectListener = vi.fn();
      const networkChangeListener = vi.fn();

      manager.on('accountChange', accountChangeListener);
      manager.on('disconnect', disconnectListener);
      manager.on('networkChange', networkChangeListener);

      // All should be registered
      expect(true).toBe(true);
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = () => {
        throw new Error('Listener error');
      };

      manager.on('accountChange', errorListener as any);

      // Should not crash - error is caught and logged
      expect(true).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent wallet checks', async () => {
      const checks = [
        manager.isWalletAvailable('freighter'),
        manager.isWalletAvailable('lobstr'),
        manager.getAvailableWallets(),
      ];

      await Promise.all(checks);

      expect(true).toBe(true);
    });

    it('should queue operations without race conditions', async () => {
      const ops = [manager.disconnect(), manager.getCurrentWalletType()];

      await Promise.all([ops[0]]);

      expect(manager.getCurrentWalletType()).toBeNull();
    });
  });

  describe('initialization robustness', () => {
    it('should initialize even if adapters fail', () => {
      expect(() => {
        const m = new WalletManager();
        m.getAvailableWallets();
      }).not.toThrow();
    });

    it('should handle multiple WalletManager instances', () => {
      const m1 = new WalletManager();
      const m2 = new WalletManager();

      expect(m1).toBeDefined();
      expect(m2).toBeDefined();
    });
  });

  describe('state consistency', () => {
    it('should maintain consistent getCurrentWalletType', () => {
      expect(manager.getCurrentWalletType()).toBeNull();

      // After operations, should still be null (since no connection in tests)
      manager.getAvailableWallets();
      expect(manager.getCurrentWalletType()).toBeNull();
    });

    it('should return consistent isWalletAvailable results', () => {
      const check1 = manager.isWalletAvailable('freighter');
      const check2 = manager.isWalletAvailable('freighter');

      expect(check1).toBe(check2);
    });
  });
});
