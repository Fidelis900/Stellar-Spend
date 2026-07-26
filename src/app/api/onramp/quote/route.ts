import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { isSupportedCurrency } from '@/lib/currencies';
import { getCachedQuote } from '@/lib/cache';
import { ErrorHandler } from '@/lib/error-handler';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fiatAmount, fiatCurrency, destinationToken, destinationAddress, provider } = body;

    if (!fiatAmount || parseFloat(fiatAmount) <= 0) {
      return ErrorHandler.validation('Invalid fiatAmount');
    }

    if (!fiatCurrency || !isSupportedCurrency(fiatCurrency)) {
      return ErrorHandler.validation(`Unsupported currency: ${fiatCurrency}`);
    }

    if (!destinationToken) {
      return ErrorHandler.validation('destinationToken is required');
    }

    if (!destinationAddress) {
      return ErrorHandler.validation('destinationAddress is required');
    }

    const quote = await getCachedQuote(
      fiatAmount,
      fiatCurrency,
      destinationToken,
      async () => {
        const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
        return svc.getQuote({ fiatAmount, fiatCurrency, destinationToken, destinationAddress, provider });
      }
    );

    return NextResponse.json(quote);
  } catch (error) {
    logger.error('Onramp quote error:', {}, error);
    return ErrorHandler.serverError(error);
  }
}
