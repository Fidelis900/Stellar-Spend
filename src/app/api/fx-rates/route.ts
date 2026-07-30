/**
 * GET /api/fx-rates
 *
 * Returns live USDC → fiat spot rates for all supported currencies.
 * Delegates to the shared fxRateService (in-process TTL cache + stale-while-revalidate).
 */
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import { fxRateService } from '@/lib/services';

export const maxDuration = 10;
// Edge CDN revalidation: 30 s
export const revalidate = 30;

export async function GET() {
  try {
    const rates = await fxRateService.getRates();

    if (rates.length === 0) {
      return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, 'No rates available'));
    }

    return NextResponse.json(
      { rates },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } },
    );
  } catch (error) {
    logger.error('fx-rates.error', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch rates'));
  }
}
