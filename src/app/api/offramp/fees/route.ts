import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { getDetailedFeeBreakdown } from '@/lib/fee-calculation';
import { ErrorHandler } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, feeMethod, receiveAmount } = body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return ErrorHandler.validation('Invalid amount: must be a positive number');
    }

    if (!currency || typeof currency !== 'string') {
      return ErrorHandler.validation('currency is required');
    }

    if (!feeMethod || !['stablecoin', 'native'].includes(feeMethod)) {
      return ErrorHandler.validation('feeMethod must be "stablecoin" or "native"');
    }

    const feeBreakdown = await getDetailedFeeBreakdown({
      amount,
      currency,
      feeMethod,
      receiveAmount,
    });

    return NextResponse.json(feeBreakdown);
  } catch (error) {
    logger.error('Fee calculation error:', {}, error);
    return ErrorHandler.serverError(error);
  }
}
