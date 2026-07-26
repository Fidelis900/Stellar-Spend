import { NextRequest, NextResponse } from 'next/server';
import { TwoFAService } from '@/lib/two-fa';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return ErrorHandler.unauthorized('User ID required');
    }

    const newCodes = TwoFAService.regenerateBackupCodes(userId);
    if (!newCodes) {
      return ErrorHandler.validation('2FA not configured');
    }

    return NextResponse.json({ backupCodes: newCodes });
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to regenerate backup codes'));
  }
}
