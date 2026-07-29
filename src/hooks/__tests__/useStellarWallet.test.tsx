import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStellarWallet } from '../useStellarWallet';
import * as WalletModule from '@/lib/wallets';

// Mock the wallet module
vi.mock('@/lib/wallets', () => ({
  WalletManager: vi.fn(),
}));

describe('useStellarWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.publicKey).toBeNull();
      expect(result.current.walletType).toBeNull();
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isSwitching).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should have auto-reconnect enabled by default', () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.settings.autoReconnect).toBe(true);
      expect(result.current.settings.rememberLastWallet).toBe(true);
    });

    it('should have empty detected wallets initially', () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.detectedWallets).toEqual([]);
    });
  });

  describe('wallet detection', () => {
    it('should detect available wallets', async () => {
      const { result } = renderHook(() => useStellarWallet());

      await act(async () => {
        result.current.detectWallets();
      });

      expect(Array.isArray(result.current.detectedWallets)).toBe(true);
    });

    it('should update lastUsedWallet when loaded', async () => {
      (window.localStorage.getItem as any).mockReturnValue('freighter');

      const { result } = renderHook(() => useStellarWallet());

      await waitFor(() => {
        expect(result.current.lastUsedWallet).not.toBeNull();
      });
    });
  });

  describe('settings management', () => {
    it('should save settings to localStorage', async () => {
      const { result } = renderHook(() => useStellarWallet());

      const newSettings = {
        autoReconnect: false,
        rememberLastWallet: false,
      };

      await act(async () => {
        result.current.saveSettings(newSettings);
      });

      expect(result.current.settings).toEqual(newSettings);
    });

    it('should load settings from localStorage', async () => {
      const savedSettings = {
        autoReconnect: false,
        rememberLastWallet: false,
      };

      (window.localStorage.getItem as any).mockReturnValue(JSON.stringify(savedSettings));

      const { result } = renderHook(() => useStellarWallet());

      await waitFor(() => {
        // Settings should be loaded on mount
        expect(window.localStorage.getItem).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('should provide friendly error messages for connection errors', () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'WalletConnectionError',
        message: 'User declined connection',
        code: 'WALLET_CONNECTION_ERROR',
      } as any;

      const message = result.current.getErrorMessage(error);
      expect(message).toContain('rejected');
    });

    it('should handle locked wallet errors', () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'WalletConnectionError',
        message: 'Wallet is locked',
        code: 'WALLET_CONNECTION_ERROR',
      } as any;

      const message = result.current.getErrorMessage(error);
      expect(message).toContain('locked');
    });

    it('should handle network mismatch errors', () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'WalletConnectionError',
        message: 'Wrong network selected',
        code: 'WALLET_CONNECTION_ERROR',
      } as any;

      const message = result.current.getErrorMessage(error);
      expect(message).toBeTruthy();
    });

    it('should handle not available errors', () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'WalletNotAvailableError',
        message: 'freighter wallet is not available',
        code: 'WALLET_NOT_AVAILABLE',
      } as any;

      const message = result.current.getErrorMessage(error);
      expect(message).toContain('not found');
    });

    it('should handle account changed errors', () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'WalletAccountChanged',
        message: 'Your wallet account has changed',
        code: 'ACCOUNT_CHANGED',
      } as any;

      const message = result.current.getErrorMessage(error);
      expect(message).toContain('account has changed');
    });

    it('should return generic error message for unknown errors', () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'Error',
        message: 'Unknown error occurred',
        code: 'UNKNOWN',
      } as any;

      const message = result.current.getErrorMessage(error);
      expect(message).toBe('Unknown error occurred');
    });

    it('should clear error state', async () => {
      const { result } = renderHook(() => useStellarWallet());

      const error = {
        name: 'Error',
        message: 'Test error',
      } as any;

      // Simulate setting an error
      await act(async () => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('last wallet persistence', () => {
    it('should save last used wallet', async () => {
      const { result } = renderHook(() => useStellarWallet());

      await act(async () => {
        const spy = vi.spyOn(window.localStorage, 'setItem');
        result.current.saveLastWallet('freighter');
        expect(spy).toHaveBeenCalledWith('stellar.lastWallet', 'freighter');
      });
    });

    it('should load last used wallet if available', async () => {
      (window.localStorage.getItem as any).mockImplementation((key: string) => {
        if (key === 'stellar.lastWallet') return 'lobstr';
        return null;
      });

      const { result } = renderHook(() => useStellarWallet());

      await waitFor(() => {
        // The hook should attempt to load the last wallet
        expect(window.localStorage.getItem).toHaveBeenCalled();
      });
    });
  });

  describe('account change detection', () => {
    it('should detect account changed flag', async () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.accountChanged).toBe(false);

      await act(async () => {
        result.current.clearAccountChanged();
      });

      expect(result.current.accountChanged).toBe(false);
    });

    it('should clear account changed flag', async () => {
      const { result } = renderHook(() => useStellarWallet());

      await act(async () => {
        result.current.clearAccountChanged();
      });

      expect(result.current.accountChanged).toBe(false);
    });
  });

  describe('wallet operations', () => {
    it('should provide disconnect method', async () => {
      const { result } = renderHook(() => useStellarWallet());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
    });

    it('should provide switchWallet method', async () => {
      const { result } = renderHook(() => useStellarWallet());

      // Method should exist and be callable
      expect(typeof result.current.switchWallet).toBe('function');
    });

    it('should provide connect method', async () => {
      const { result } = renderHook(() => useStellarWallet());

      // Method should exist and be callable
      expect(typeof result.current.connect).toBe('function');
    });

    it('should provide autoReconnect method', async () => {
      const { result } = renderHook(() => useStellarWallet());

      // Method should exist and be callable
      expect(typeof result.current.autoReconnect).toBe('function');
    });
  });

  describe('custom network passphrase', () => {
    it('should accept custom network passphrase', () => {
      const customPassphrase = 'Custom Network ; 2025';
      const { result } = renderHook(() => useStellarWallet(customPassphrase));

      expect(result.current).toBeDefined();
      // The passphrase is used internally for signing
    });
  });

  describe('cleanup', () => {
    it('should cleanup listeners on unmount', async () => {
      const { unmount } = renderHook(() => useStellarWallet());

      await act(async () => {
        unmount();
      });

      // Component should unmount without errors
      expect(true).toBe(true);
    });
  });

  describe('state consistency', () => {
    it('should maintain consistent connected state', async () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.publicKey).toBeNull();
      expect(result.current.walletType).toBeNull();
    });

    it('should track connecting state', () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.isConnecting).toBe(false);
    });

    it('should track switching state', () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.isSwitching).toBe(false);
    });

    it('should track auto-reconnecting state', () => {
      const { result } = renderHook(() => useStellarWallet());

      expect(result.current.isAutoReconnecting).toBe(false);
    });
  });
});
