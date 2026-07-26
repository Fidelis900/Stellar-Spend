import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { validateAmount } from '@/lib/offramp/utils/validation';
import { calculateBridgeAmount } from '@/lib/offramp/utils/quote-fetcher';
import { aggregateQuotes, type QuoteProvider } from '@/lib/quote-aggregator';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 20;

const STABLECOIN_FEE = '0.5';

const FEE_METHOD_MAP: Record<string, 'stablecoin' | 'native'> = {
  USDC: 'stablecoin',
  stablecoin: 'stablecoin',
  XLM: 'native',
  native: 'native',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, feeMethod, providers } = body;

    if (!validateAmount(String(amount ?? ''))) {
      return ErrorHandler.validation('Invalid amount: must be a positive number');
    }

    if (!currency || typeof currency !== 'string') {
      return ErrorHandler.validation('currency is required');
    }

    const normalizedFee = FEE_METHOD_MAP[feeMethod];
    if (!normalizedFee) {
      return ErrorHandler.validation('feeMethod must be "USDC", "XLM", "stablecoin", or "native"');
    }

    const bridgeAmount =
      normalizedFee === 'stablecoin'
        ? calculateBridgeAmount(String(amount), 'stablecoin', STABLECOIN_FEE)
        : String(amount);

    // Get bridge receive amount (simplified - in production, call Allbridge SDK)
    const receiveAmount = bridgeAmount;

    // Aggregate quotes from multiple providers
    const providerList: QuoteProvider[] = providers || ['paycrest'];
    const aggregatedQuotes = await aggregateQuotes(receiveAmount, currency, providerList);

    if (!aggregatedQuotes.bestQuote) {
      return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, 'No quotes available from any provider'));
    }

    return NextResponse.json(aggregatedQuotes);
  } catch (error) {
    logger.error('Quote aggregation error:', {}, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Invalid') || message.includes('less than')) {
      return ErrorHandler.validation(message);
    }
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to aggregate quotes'));
  }
}
