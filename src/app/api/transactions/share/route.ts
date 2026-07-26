import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { ShareSettings } from '@/types/sharing';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(req: NextRequest) {
  try {
    const userAddress = req.headers.get('x-user-address');
    if (!userAddress) {
      return ErrorHandler.unauthorized('User address required');
    }

    const { transactionId, settings }: { transactionId: string; settings: ShareSettings } =
      await req.json();

    if (!transactionId) {
      return ErrorHandler.validation('Transaction ID required');
    }

    const svc = await globalContainer.resolve(SERVICE_KEYS.SHARING_SERVICE);
    const share = await svc.createShareLink(transactionId, userAddress, settings);

    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    logger.error('Error creating share link:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to create share link'));
  }
}

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.headers.get('x-user-address');
    if (!userAddress) {
      return ErrorHandler.unauthorized('User address required');
    }

    const svc = await globalContainer.resolve(SERVICE_KEYS.SHARING_SERVICE);
    const shares = await svc.getUserShareLinks(userAddress);

    return NextResponse.json(shares);
  } catch (error) {
    logger.error('Error fetching share links:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch share links'));
  }
}
