import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { CreateDisputeRequest } from '@/types/disputes';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const userAddress = req.headers.get('x-user-address');
      if (!userAddress) {
        return ErrorHandler.unauthorized('User address required');
      }

      const body: CreateDisputeRequest = await req.json();

      if (!body.transactionId || !body.reason) {
        return ErrorHandler.validation('Transaction ID and reason are required');
      }

      const dispute = await disputeRepository.createDispute(userAddress, body);

      return NextResponse.json(dispute, { status: 201 });
    } catch (error) {
      logger.error('Error creating dispute:', {}, error);
      return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to create dispute'));
    }
  }, { required: true });
}

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.headers.get('x-user-address');
    if (!userAddress) {
      return ErrorHandler.unauthorized('User address required');
    }

    const disputes = await disputeRepository.getDisputesByUser(userAddress);

    return NextResponse.json(disputes);
  } catch (error) {
    logger.error('Error fetching disputes:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch disputes'));
  }
}
