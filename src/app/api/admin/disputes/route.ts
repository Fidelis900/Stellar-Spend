import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { DisputeStatus, DisputeUpdate } from '@/types/disputes';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(req: NextRequest) {
  try {
    // TODO: Add admin authentication check
    const status = req.nextUrl.searchParams.get('status');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

    const disputes = await disputeRepository.listDisputes((status || undefined) as DisputeStatus | undefined, limit, offset);

    return NextResponse.json(disputes);
  } catch (error) {
    logger.error('Error fetching disputes', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch disputes'));
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // TODO: Add admin authentication check
    const { disputeId, update }: { disputeId: string; update: DisputeUpdate } = await req.json();

    if (!disputeId) {
      return ErrorHandler.validation('Dispute ID required');
    }

    const dispute = await disputeRepository.updateDispute(disputeId, update);

    if (!dispute) {
      return ErrorHandler.notFound("Dispute");
    }

    return NextResponse.json(dispute);
  } catch (error) {
    logger.error('Error updating dispute', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to update dispute'));
  }
}
