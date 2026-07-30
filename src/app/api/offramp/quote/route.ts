import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { fetchPaycrestQuote, buildQuote, calculateBridgeAmount } from '@/lib/offramp';
import { ErrorHandler } from '@/lib/error-handler';
import { withAllbridgeTimeout } from '@/lib/offramp';
import { isSupportedCurrency } from '@/lib/currencies';
import { screenAddress } from '@/lib/compliance-screening';
import { quoteRouteSchema, formatZodErrors } from '@/lib/validators';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 20;

const STABLECOIN_FEE = '0.5';

// Client sends "USDC" | "XLM"; build-tx route uses "stablecoin" | "native"
const FEE_METHOD_MAP: Record<string, 'stablecoin' | 'native'> = {
  USDC: 'stablecoin',
  stablecoin: 'stablecoin',
  XLM: 'native',
  native: 'native',
};

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const parsed = quoteRouteSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = formatZodErrors(parsed.error);
    return ErrorHandler.handle(
      new ApiError(ErrorType.VALIDATION, errors[0].message, 400, { errors }),
    );
  }

  const { amount, currency, feeMethod, sourceAddress } = parsed.data;

  try {
    if (!isSupportedCurrency(currency)) {
      return ErrorHandler.handle(
        new ApiError(ErrorType.VALIDATION, `Unsupported currency: ${currency}`, 400),
      );
    }

    if (sourceAddress) {
      const screeningResult = await screenAddress({
        address: sourceAddress,
        addressType: 'stellar',
        amount: parseFloat(amount),
        currency,
      });
      if (screeningResult.verdict === 'deny') {
        return NextResponse.json(
          { error: 'Source address blocked by compliance screening', screening: screeningResult },
          { status: 403 },
        );
      }
    }

    const normalizedFee = FEE_METHOD_MAP[feeMethod];
    const bridgeAmount = normalizedFee === 'stablecoin'
      ? calculateBridgeAmount(String(amount), 'stablecoin', STABLECOIN_FEE)
      : String(amount);

    // Initialize Allbridge SDK
    let receiveAmount: string;
    try {
      const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await import('@allbridge/bridge-core-sdk');

      const sdk = new AllbridgeCoreSdk({
        ...nodeRpcUrlsDefault,
        sorobanNetworkPassphrase: 'Public Global Stellar Network ; September 2015',
        ...(env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL && {
          sorobanRpc: env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL,
        }),
        ...(env.server.BASE_RPC_URL && { ETH: env.server.BASE_RPC_URL }),
      });

      const chainDetails = await sdk.chainDetailsMap();
      let stellarChain: any = null;
      let baseChain: any = null;

      for (const [, chain] of Object.entries(chainDetails)) {
        const c = chain as any;
        if (c.name?.toLowerCase().includes('stellar') || c.name?.toLowerCase().includes('soroban'))
          stellarChain = c;
        if (c.name?.toLowerCase().includes('ethereum') || c.name?.toLowerCase().includes('base'))
          baseChain = c;
      }

      if (!stellarChain || !baseChain) throw new Error('Chain details unavailable');

      const stellarUsdc = stellarChain.tokens.find((t: any) => t.symbol === 'USDC');
      const baseUsdc = baseChain.tokens.find((t: any) => t.symbol === 'USDC');

      if (!stellarUsdc || !baseUsdc) throw new Error('USDC token not found');

      receiveAmount = await withAllbridgeTimeout(
        sdk.getAmountToBeReceived(bridgeAmount, stellarUsdc, baseUsdc),
        'getAmountToBeReceived',
      );
    } catch {
      return NextResponse.json({ error: 'Bridge quote unavailable' }, { status: 502 });
    }

    // Fetch Paycrest FX rate
    let rate: number;
    let destinationAmount: string;
    try {
      ({ rate, destinationAmount } = await fetchPaycrestQuote(receiveAmount, currency));
    } catch {
      return NextResponse.json({ error: 'FX rate unavailable' }, { status: 502 });
    }

    const quote = buildQuote(destinationAmount, rate, currency, '0', '0', 300);
    return NextResponse.json(quote);
  } catch (error) {
    logger.error('Quote fetch error', {}, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Invalid') || message.includes('less than')) {
      return ErrorHandler.handle(new ApiError(ErrorType.VALIDATION, message, 400));
    }
    return ErrorHandler.serverError(error);
  }
}
