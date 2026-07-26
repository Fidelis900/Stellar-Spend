import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';

export const maxDuration = 20;

export async function POST(request: NextRequest) {
  return withIdempotency(request, async () => {
    try {
      const body = await request.json();
      const { quoteId, fiatAmount, fiatCurrency, destinationAmount, destinationToken, destinationAddress, provider, rate } = body;

      if (!quoteId) {
        return ErrorHandler.validation('quoteId is required');
      }

      if (!fiatAmount || parseFloat(fiatAmount) <= 0) {
        return ErrorHandler.validation('Invalid fiatAmount');
      }

      if (!fiatCurrency) {
        return ErrorHandler.validation('fiatCurrency is required');
      }

      if (!destinationAmount || parseFloat(destinationAmount) <= 0) {
        return ErrorHandler.validation('Invalid destinationAmount');
      }

      if (!destinationToken) {
        return ErrorHandler.validation('destinationToken is required');
      }

      if (!destinationAddress) {
        return ErrorHandler.validation('destinationAddress is required');
      }

      if (!provider) {
        return ErrorHandler.validation('provider is required');
      }

      if (!rate || rate <= 0) {
        return ErrorHandler.validation('Invalid rate');
      }

      const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
      const order = await svc.createOrder({
        quoteId,
        fiatAmount,
        fiatCurrency,
        destinationAmount,
        destinationToken,
        destinationAddress,
        provider,
        rate,
      });

      return NextResponse.json(order, { status: 201 });
    } catch (error) {
      logger.error('Onramp order error:', {}, error);
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}
