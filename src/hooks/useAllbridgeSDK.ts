'use client';

import { useMemo } from 'react';

type AllbridgeSdk = ReturnType<typeof import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk>;

// Cached singleton promise for SDK initialization
let sdkPromise: Promise<AllbridgeSdk> | null = null;

async function initializeAllbridgeSDK(): Promise<AllbridgeSdk> {
  try {
    // Dynamic import to avoid SSR issues
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await import('@allbridge/bridge-core-sdk');

    // Initialize with Stellar and Base chain configs
    // nodeRpcUrlsDefault provides mainnet RPC URLs for all chains
    // We override with our custom RPC URLs from environment
    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      sorobanNetworkPassphrase: 'Public Global Stellar Network ; September 2015',
      // Override with custom RPC URLs if provided
      ...(process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL && {
        sorobanRpc: process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL,
      }),
      ...(process.env.NEXT_PUBLIC_BASE_RPC_URL && {
        ETH: process.env.NEXT_PUBLIC_BASE_RPC_URL,
      }),
    });

    return sdk;
  } catch (error) {
    console.error('Failed to initialize Allbridge SDK:', error);
    throw error;
  }
}

/**
 * Hook to get cached Allbridge SDK instance
 * Returns a promise that resolves to the SDK singleton
 *
 * Usage:
 * const sdkPromise = useAllbridgeSDK();
 * const sdk = await sdkPromise;
 */
export function useAllbridgeSDK(): Promise<AllbridgeSdk> {
  return useMemo(() => {
    if (!sdkPromise) {
      sdkPromise = initializeAllbridgeSDK();
    }
    return sdkPromise;
  }, []);
}
