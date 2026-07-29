/**
 * Allbridge SDK Extension Methods
 *
 * This module provides extension methods for the Allbridge Core SDK
 * to simplify common operations like fee calculation and status polling.
 */

import type { BridgeStatus } from '../types';

/**
 * Get gas fee for bridge transaction, preferring stablecoin payment method
 *
 * @param sdk - Allbridge Core SDK instance
 * @param sourceToken - Source chain token info
 * @param destinationToken - Destination chain token info
 * @returns Object with gasAmount and feeTokenAmount (unused fee is "0")
 */
export async function getAllbridgeGasFee(
  sdk: any,
  sourceToken: any,
  destinationToken: any,
): Promise<{ gasAmount: string; feeTokenAmount: string }> {
  const { Messenger, FeePaymentMethod } = await import('@allbridge/bridge-core-sdk');

  const feeOptions = await sdk.getGasFeeOptions(sourceToken, destinationToken, Messenger.ALLBRIDGE);

  // Prefer stablecoin fee (no extra XLM needed)
  if (feeOptions[FeePaymentMethod.WITH_STABLECOIN]) {
    return {
      gasAmount: '0',
      feeTokenAmount: feeOptions[FeePaymentMethod.WITH_STABLECOIN],
    };
  }

  // Fall back to native currency fee
  if (feeOptions[FeePaymentMethod.WITH_NATIVE_CURRENCY]) {
    return {
      gasAmount: feeOptions[FeePaymentMethod.WITH_NATIVE_CURRENCY],
      feeTokenAmount: '0',
    };
  }

  // Default fallback
  return {
    gasAmount: '0',
    feeTokenAmount: '0',
  };
}

/**
 * Get both native and stablecoin gas fee options for UI display
 *
 * @param sdk - Allbridge Core SDK instance
 * @param sourceToken - Source chain token info
 * @param destinationToken - Destination chain token info
 * @returns Object with both fee options in int and float formats
 */
export async function getAllbridgeGasFeeOptions(
  sdk: any,
  sourceToken: any,
  destinationToken: any,
): Promise<{
  native: { int: string; float: string };
  stablecoin: { int: string; float: string };
}> {
  const { Messenger, FeePaymentMethod, AmountFormat } = await import('@allbridge/bridge-core-sdk');

  try {
    const feeOptions = await sdk.getGasFeeOptions(
      sourceToken,
      destinationToken,
      Messenger.ALLBRIDGE,
    );

    // Get native fee in both formats
    const nativeInt = feeOptions[FeePaymentMethod.WITH_NATIVE_CURRENCY]?.[AmountFormat.INT] || '0';
    const nativeFloat =
      feeOptions[FeePaymentMethod.WITH_NATIVE_CURRENCY]?.[AmountFormat.FLOAT] || '0';

    // Get stablecoin fee in both formats
    const stablecoinInt = feeOptions[FeePaymentMethod.WITH_STABLECOIN]?.[AmountFormat.INT] || '0';
    const stablecoinFloat =
      feeOptions[FeePaymentMethod.WITH_STABLECOIN]?.[AmountFormat.FLOAT] || '0';

    return {
      native: {
        int: nativeInt,
        float: nativeFloat,
      },
      stablecoin: {
        int: stablecoinInt,
        float: stablecoinFloat,
      },
    };
  } catch (error) {
    // Return default values on error
    return {
      native: { int: '0', float: '0' },
      stablecoin: { int: '0', float: '0' },
    };
  }
}

/**
 * Select fee parameters based on user's preferred payment method
 *
 * @param feeOptions - Fee options object with native and stablecoin fees
 * @param method - Payment method: "native" or "stablecoin"
 * @returns Object with gasAmount and feeTokenAmount (unused fee is "0")
 */
export function getBridgeFeeForMethod(
  feeOptions: {
    native: { int: string; float: string };
    stablecoin: { int: string; float: string };
  },
  method: 'native' | 'stablecoin',
): { gasAmount: string; feeTokenAmount: string } {
  if (method === 'stablecoin') {
    return {
      gasAmount: '0',
      feeTokenAmount: feeOptions.stablecoin.int,
    };
  }

  // method === 'native'
  return {
    gasAmount: feeOptions.native.int,
    feeTokenAmount: '0',
  };
}

/**
 * Get bridge transfer status and map to standardized BridgeStatus type
 *
 * @param sdk - Allbridge Core SDK instance
 * @param chainSymbol - Chain symbol (e.g., "SRB" for Stellar)
 * @param txHash - Transaction hash to check status for
 * @returns Object with status, txHash, and optional receiveAmount
 */
export async function getAllbridgeTransferStatus(
  sdk: any,
  chainSymbol: string,
  txHash: string,
): Promise<{ status: BridgeStatus; txHash: string; receiveAmount?: string }> {
  try {
    const transferStatus = await sdk.getTransferStatus(chainSymbol, txHash);

    // Map Allbridge status strings to BridgeStatus type
    let status: BridgeStatus = 'pending';

    if (transferStatus?.status) {
      const allbridgeStatus = transferStatus.status.toLowerCase();

      if (allbridgeStatus === 'completed' || allbridgeStatus === 'success') {
        status = 'completed';
      } else if (allbridgeStatus === 'failed' || allbridgeStatus === 'error') {
        status = 'failed';
      } else if (allbridgeStatus === 'processing' || allbridgeStatus === 'in_progress') {
        status = 'processing';
      } else if (allbridgeStatus === 'pending' || allbridgeStatus === 'waiting') {
        status = 'pending';
      }
      // default remains 'pending'
    }

    return {
      status,
      txHash,
      receiveAmount: transferStatus?.receiveAmount,
    };
  } catch (error) {
    // On error, return pending status (don't throw)
    return {
      status: 'pending',
      txHash,
    };
  }
}
