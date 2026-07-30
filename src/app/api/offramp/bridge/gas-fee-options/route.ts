import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { withAllbridgeTimeout } from '@/lib/offramp';
import { ErrorHandler } from '@/lib/error-handler';

export const maxDuration = 20;

export interface GasFeeOptions {
  feeOptions: {
    native: { int: string; float: string };
    stablecoin: { int: string; float: string };
  };
}

// In-memory cache for gas fee options
let cachedFeeOptions: GasFeeOptions | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 1000; // 60 seconds

/**
 * GET /api/offramp/bridge/gas-fee-options
 *
 * Fetches gas fee options from Allbridge SDK.
 * Returns native (XLM) and stablecoin (USDC) fee options.
 * Caches result for 60 seconds.
 */
export async function GET(): Promise<NextResponse<GasFeeOptions | { error: string }>> {
  try {
    // Check cache
    const now = Date.now();
    if (cachedFeeOptions && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(cachedFeeOptions, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    // Initialize Allbridge SDK
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault, Messenger, FeePaymentMethod } = await import(
      '@allbridge/bridge-core-sdk'
    );

    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      ...(env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL && {
        SRB: env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL,
      }),
    });

    // Get chain details to find USDC tokens
    const chainDetails = await withAllbridgeTimeout(sdk.chainDetailsMap(), 'chainDetailsMap');

    let stellarChain: any = null;
    let baseChain: any = null;

    for (const [, chain] of Object.entries(chainDetails)) {
      const chainObj = chain as any;
      if (
        chainObj.name?.toLowerCase().includes('stellar') ||
        chainObj.name?.toLowerCase().includes('soroban')
      ) {
        stellarChain = chainObj;
      }
      if (
        chainObj.name?.toLowerCase().includes('ethereum') ||
        chainObj.name?.toLowerCase().includes('base')
      ) {
        baseChain = chainObj;
      }
    }

    if (!stellarChain || !baseChain) {
      throw new Error('Failed to fetch chain details from Allbridge');
    }

    // Find USDC tokens on both chains
    const stellarUsdc = stellarChain.tokens.find((t: any) => t.symbol === 'USDC');
    const baseUsdc = baseChain.tokens.find((t: any) => t.symbol === 'USDC');

    if (!stellarUsdc || !baseUsdc) {
      throw new Error('USDC token not found on one or both chains');
    }

    // Get gas fee options from Allbridge SDK
    const gasFeeOptions = await withAllbridgeTimeout(
      sdk.getGasFeeOptions(stellarUsdc, baseUsdc, Messenger.ALLBRIDGE),
      'getGasFeeOptions',
    );

    // Normalize fee options — SDK returns keyed by FeePaymentMethod enum values
    const nativeFee =
      (gasFeeOptions as any)[FeePaymentMethod.WITH_NATIVE_CURRENCY] ??
      (gasFeeOptions as any).native;
    const stablecoinFee =
      (gasFeeOptions as any)[FeePaymentMethod.WITH_STABLECOIN] ?? (gasFeeOptions as any).stablecoin;

    const result: GasFeeOptions = {
      feeOptions: {
        native: {
          int: String(nativeFee?.int ?? '0'),
          float: String(nativeFee?.float ?? '0'),
        },
        stablecoin: {
          int: String(stablecoinFee?.int ?? '0'),
          float: String(stablecoinFee?.float ?? '0'),
        },
      },
    };

    // Cache the result
    cachedFeeOptions = result;
    cacheTimestamp = now;

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    logger.error('Error fetching gas fee options:', {}, error);
    return ErrorHandler.handle(error);
  }
}
