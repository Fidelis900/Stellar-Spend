import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(req: NextRequest) {
  try {
    const adminId = req.headers.get('x-admin-id');
    if (!adminId) {
      return ErrorHandler.unauthorized('Admin authorization required');
    }

    const analytics = await disputeRepository.getAnalytics();
    return NextResponse.json(analytics);
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch dispute analytics'));
  }
}
