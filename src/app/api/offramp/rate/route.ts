/**
 * GET /api/offramp/rate
 *
 * Returns the live USDC/NGN spot rate for the FxTicker component.
 * Delegates to the shared fxRateService.
 */
import { NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import { fxRateService } from '@/lib/services';

export const maxDuration = 10;

export async function GET() {
  try {
    const rate = await fxRateService.getRate('NGN');
    return NextResponse.json({ rate });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, 'unavailable'));
  }
}
