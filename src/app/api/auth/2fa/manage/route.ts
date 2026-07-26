import { NextRequest, NextResponse } from 'next/server';
import { TwoFAService } from '@/lib/two-fa';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return ErrorHandler.unauthorized('User ID required');
    }

    const config = TwoFAService.getConfig(userId);
    if (!config) {
      return NextResponse.json({ enabled: false, method: null, isEnforced: false });
    }

    return NextResponse.json({
      enabled: config.isEnabled,
      method: config.method,
      isEnforced: config.isEnforced,
      backupCodesRemaining: config.backupCodes.length,
      lastVerifiedAt: config.lastVerifiedAt,
    });
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch 2FA status'));
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return ErrorHandler.unauthorized('User ID required');
    }

    const { action } = await req.json();

    if (action === 'enable') {
      const config = TwoFAService.enable(userId);
      if (!config) {
        return ErrorHandler.validation('2FA not configured. Call /setup first.');
      }
      return NextResponse.json({ success: true, enabled: true });
    }

    if (action === 'disable') {
      const config = TwoFAService.disable(userId);
      if (!config) {
        return ErrorHandler.validation('2FA not configured');
      }
      return NextResponse.json({ success: true, enabled: false });
    }

    return ErrorHandler.validation("action must be 'enable' or 'disable'");
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to update 2FA'));
  }
}
