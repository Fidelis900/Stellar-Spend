import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    const svc = await globalContainer.resolve(SERVICE_KEYS.SHARING_SERVICE);
    const share = await svc.getShareLink(token);

    if (!share) {
      return ErrorHandler.notFound("Share link");
    }

    if (share.expiresAt && share.expiresAt < Date.now()) {
      return ErrorHandler.handle(new ApiError(ErrorType.NOT_FOUND, 'Share link expired', 410));
    }

    // Increment view count
    await svc.incrementViewCount(token);

    // TODO: Fetch transaction details from database
    const preview = {
      transactionId: share.transactionId,
      amount: '100.00',
      currency: 'NGN',
      status: 'completed',
      timestamp: Date.now(),
    };

    return NextResponse.json({
      share,
      preview,
    });
  } catch (error) {
    logger.error('Error fetching share:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch share'));
  }
}
