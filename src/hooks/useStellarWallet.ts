'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { WalletManager } from '@/lib/wallets/manager';
import { WalletType, WalletConnection, WalletError } from '@/lib/wallets/adapter';

interface FreighterWindow extends Window {
  freighter?: {
    addEventListener: (event: string, handler: () => void) => void;
    removeEventListener: (event: string, handler: () => void) => void;
  };
}

interface StellarWindow extends Window {
  stellar?: {
    addEventListener: (event: string, handler: () => void) => void;
    removeEventListener: (event: string, handler: () => void) => void;
  };
  lobstr?: {
    addEventListener: (event: string, handler: () => void) => void;
    removeEventListener: (event: string, handler: () => void) => void;
  };
}

const STORAGE_KEYS = {
  LAST_WALLET: 'stellar.lastWallet',
  LAST_PUBLIC_KEY: 'stellar.lastPublicKey',
  WALLET_SETTINGS: 'stellar.walletSettings',
};

export interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  walletType: WalletType | null;
  isConnecting: boolean;
  isSwitching: boolean;
  error: WalletError | null;
  isAutoReconnecting: boolean;
  detectedWallets: WalletType[];
  lastUsedWallet: WalletType | null;
  accountChanged: boolean;
}

export interface WalletSettings {
  autoReconnect: boolean;
  rememberLastWallet: boolean;
}

/**
 * useStellarWallet
 * 
 * Comprehensive wallet hook that handles:
 * - Wallet detection (Freighter, Lobstr, none installed)
 * - Auto-reconnect on page reload
 * - Account change detection
 * - Error classification with actionable messages
 * - Switch wallet without full disconnect
 * - Last-used wallet persistence
 * - Event listener cleanup
 */
export function useStellarWallet(
  networkPassphrase: string = 'Test SDF Network ; September 2015'
) {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    publicKey: null,
    walletType: null,
    isConnecting: false,
    isSwitching: false,
    error: null,
    isAutoReconnecting: false,
    detectedWallets: [],
    lastUsedWallet: null,
    accountChanged: false,
  });

  const [settings, setSettings] = useState<WalletSettings>({
    autoReconnect: true,
    rememberLastWallet: true,
  });

  const managerRef = useRef<WalletManager | null>(null);
  const accountChangeListenersRef = useRef<Array<() => void>>([]);

  // Initialize wallet manager
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new WalletManager();
    }
  }, []);

  // Detect available wallets
  const detectWallets = useCallback(() => {
    if (!managerRef.current) return [];
    const available = managerRef.current.getAvailableWallets();
    const walletTypes = available.map(w => w.type);
    setState(prev => ({ ...prev, detectedWallets: walletTypes }));
    return walletTypes;
  }, []);

  // Load settings from localStorage
  const loadSettings = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WALLET_SETTINGS);
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load wallet settings:', err);
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: WalletSettings) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.WALLET_SETTINGS, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (err) {
      console.error('Failed to save wallet settings:', err);
    }
  }, []);

  // Load last-used wallet from localStorage
  const loadLastWallet = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      const lastWallet = localStorage.getItem(STORAGE_KEYS.LAST_WALLET) as WalletType | null;
      if (lastWallet && managerRef.current?.isWalletAvailable(lastWallet)) {
        setState(prev => ({ ...prev, lastUsedWallet: lastWallet }));
        return lastWallet;
      }
    } catch (err) {
      console.error('Failed to load last wallet:', err);
    }
    return null;
  }, []);

  // Save last-used wallet to localStorage
  const saveLastWallet = useCallback((walletType: WalletType) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_WALLET, walletType);
      setState(prev => ({ ...prev, lastUsedWallet: walletType }));
    } catch (err) {
      console.error('Failed to save last wallet:', err);
    }
  }, []);

  // Setup account change listener for connected wallet
  const setupAccountChangeListener = useCallback((walletType: WalletType) => {
    if (typeof window === 'undefined') return;

    // Clean up existing listeners
    accountChangeListenersRef.current.forEach(cleanup => cleanup());
    accountChangeListenersRef.current = [];

    if (walletType === 'freighter') {
      try {
        const handler = () => {
          // Account changed in Freighter
          setState(prev => ({
            ...prev,
            accountChanged: true,
            error: {
              name: 'WalletAccountChanged',
              message: 'Your wallet account has changed. Please reconnect to continue.',
              code: 'ACCOUNT_CHANGED',
            } as WalletError,
          }));
        };

        // Listen to freighter events via window object
        const w = window as unknown as FreighterWindow;
        if (w.freighter?.addEventListener) {
          w.freighter.addEventListener('publicKeyChange', handler);
          accountChangeListenersRef.current.push(() => {
            w.freighter?.removeEventListener('publicKeyChange', handler);
          });
        }
      } catch (err) {
        console.error('Failed to setup Freighter listener:', err);
      }
    } else if (walletType === 'lobstr') {
      try {
        const handler = () => {
          setState(prev => ({
            ...prev,
            accountChanged: true,
            error: {
              name: 'WalletAccountChanged',
              message: 'Your wallet account has changed. Please reconnect to continue.',
              code: 'ACCOUNT_CHANGED',
            } as WalletError,
          }));
        };

        const w = window as unknown as StellarWindow;
        const provider = w.lobstr ?? w.stellar;
        if (provider?.addEventListener) {
          provider.addEventListener('accountChange', handler);
          accountChangeListenersRef.current.push(() => {
            provider?.removeEventListener('accountChange', handler);
          });
        }
      } catch (err) {
        console.error('Failed to setup Lobstr listener:', err);
      }
    }
  }, []);

  // Connect to a specific wallet
  const connect = useCallback(
    async (walletType: WalletType) => {
      if (!managerRef.current) return;

      setState(prev => ({ ...prev, isConnecting: true, error: null, accountChanged: false }));

      try {
        const connection = await managerRef.current.connect(walletType);
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          publicKey: connection.publicKey,
          walletType: connection.walletType,
          isConnecting: false,
          error: null,
          accountChanged: false,
        }));

        // Save last wallet if setting is enabled
        if (settings.rememberLastWallet) {
          saveLastWallet(walletType);
        }

        // Setup account change listener
        setupAccountChangeListener(walletType);

        return connection;
      } catch (err) {
        const error = err as WalletError;
        setState(prev => ({
          ...prev,
          isConnecting: false,
          error: error,
          isConnected: false,
          publicKey: null,
          walletType: null,
        }));
        throw error;
      }
    },
    [settings.rememberLastWallet, saveLastWallet, setupAccountChangeListener]
  );

  // Auto-reconnect on page reload
  const autoReconnect = useCallback(async () => {
    if (!managerRef.current || !settings.autoReconnect) return;

    setState(prev => ({ ...prev, isAutoReconnecting: true }));

    try {
      const lastWallet = loadLastWallet();
      
      if (lastWallet) {
        try {
          const connection = await managerRef.current.connect(lastWallet);
          setState(prev => ({
            ...prev,
            isConnected: true,
            publicKey: connection.publicKey,
            walletType: connection.walletType,
            isAutoReconnecting: false,
            error: null,
          }));
          setupAccountChangeListener(lastWallet);
        } catch (err) {
          // Auto-reconnect failed, but don't show error initially
          setState(prev => ({
            ...prev,
            isAutoReconnecting: false,
            error: null,
          }));
        }
      } else {
        setState(prev => ({ ...prev, isAutoReconnecting: false }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        isAutoReconnecting: false,
        error: err as WalletError,
      }));
    }
  }, [loadLastWallet, settings.autoReconnect, setupAccountChangeListener]);

  // Switch wallet without full disconnect
  const switchWallet = useCallback(
    async (newWalletType: WalletType) => {
      if (!managerRef.current) return;

      if (newWalletType === state.walletType) {
        return; // Already connected to this wallet
      }

      setState(prev => ({ ...prev, isSwitching: true, error: null }));

      try {
        // Disconnect from current wallet
        await managerRef.current.disconnect();

        // Connect to new wallet
        const connection = await managerRef.current.connect(newWalletType);

        setState(prev => ({
          ...prev,
          isConnected: true,
          publicKey: connection.publicKey,
          walletType: connection.walletType,
          isSwitching: false,
          error: null,
          accountChanged: false,
        }));

        if (settings.rememberLastWallet) {
          saveLastWallet(newWalletType);
        }

        setupAccountChangeListener(newWalletType);

        return connection;
      } catch (err) {
        const error = err as WalletError;
        setState(prev => ({
          ...prev,
          isSwitching: false,
          error: error,
        }));
        throw error;
      }
    },
    [state.walletType, settings.rememberLastWallet, saveLastWallet, setupAccountChangeListener]
  );

  // Disconnect from wallet
  const disconnect = useCallback(async () => {
    if (!managerRef.current) return;

    try {
      await managerRef.current.disconnect();
      
      // Clean up listeners
      accountChangeListenersRef.current.forEach(cleanup => cleanup());
      accountChangeListenersRef.current = [];

      setState(prev => ({
        ...prev,
        isConnected: false,
        publicKey: null,
        walletType: null,
        error: null,
        accountChanged: false,
      }));
    } catch (err) {
      const error = err as WalletError;
      setState(prev => ({
        ...prev,
        error: error,
      }));
    }
  }, []);

  // Clear account changed flag and error
  const clearAccountChanged = useCallback(() => {
    setState(prev => ({
      ...prev,
      accountChanged: false,
      error: prev.accountChanged ? null : prev.error,
    }));
  }, []);

  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  // Initialize on mount
  useEffect(() => {
    loadSettings();
    detectWallets();
    loadLastWallet();
  }, [loadSettings, detectWallets, loadLastWallet]);

  // Auto-reconnect after initialization
  useEffect(() => {
    if (!state.isConnected && !state.isAutoReconnecting && managerRef.current) {
      autoReconnect();
    }
  }, [autoReconnect, state.isConnected, state.isAutoReconnecting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      accountChangeListenersRef.current.forEach(cleanup => cleanup());
    };
  }, []);

  // Get friendly error message
  const getErrorMessage = useCallback((error: WalletError | null): string => {
    if (!error) return '';

    if (error.code === 'ACCOUNT_CHANGED') {
      return 'Your wallet account has changed. Please reconnect.';
    }
    if (error.code === 'WALLET_NOT_AVAILABLE') {
      return 'Wallet extension not found. Please install it.';
    }
    if (error.code === 'WALLET_CONNECTION_ERROR') {
      const msg = error.message.toLowerCase();
      if (msg.includes('declined') || msg.includes('rejected')) {
        return 'Connection rejected. Please approve the request in your wallet.';
      }
      if (msg.includes('locked')) {
        return 'Wallet is locked. Please unlock it.';
      }
      if (msg.includes('testnet') || msg.includes('mainnet')) {
        return 'Wrong network. Please switch to the correct network in your wallet.';
      }
    }
    if (error.code === 'WALLET_SIGNING_ERROR') {
      const msg = error.message.toLowerCase();
      if (msg.includes('declined') || msg.includes('rejected')) {
        return 'Transaction rejected. Please approve it in your wallet.';
      }
      if (msg.includes('locked')) {
        return 'Wallet is locked. Please unlock it.';
      }
    }

    return error.message || 'An unknown wallet error occurred.';
  }, []);

  return {
    // State
    ...state,
    error: state.error,
    errorMessage: getErrorMessage(state.error),

    // Settings
    settings,
    saveSettings,

    // Actions
    connect,
    disconnect,
    switchWallet,
    autoReconnect,
    clearError,
    clearAccountChanged,
    detectWallets,
  };
}
