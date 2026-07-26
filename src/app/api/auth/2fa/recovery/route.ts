import { NextRequest, NextResponse } from 'next/server';
import { TwoFAService } from '@/lib/two-fa';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

// Initiate recovery — issues a short-lived token
export async function POST(req: NextRequest) {
  try {
    const { userId, recoveryToken, newMethod } = await req.json();

    // Start recovery: userId provided, no token yet
    if (userId && !recoveryToken) {
      const session = TwoFAService.initiateRecovery(userId);
      // In production: send `session.token` to verified contact (email/phone)
      return NextResponse.json({
        message: 'Recovery initiated. Check your registered contact for the token.',
        expiresAt: session.expiresAt,
      });
    }

    // Complete recovery: token + new method provided
    if (recoveryToken && newMethod) {
      if (!['totp', 'sms'].includes(newMethod)) {
        return ErrorHandler.validation("newMethod must be 'totp' or 'sms'");
      }

      const config = TwoFAService.completeRecovery(recoveryToken, newMethod);
      if (!config) {
        return ErrorHandler.validation('Invalid or expired recovery token');
      }

      return NextResponse.json({
        message: '2FA reset successfully. Complete setup to re-enable.',
        method: config.method,
        secret: config.method === 'totp' ? config.secret : undefined,
        backupCodes: config.backupCodes,
      });
    }

    return ErrorHandler.validation('Provide userId to initiate, or recoveryToken + newMethod to complete');
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Recovery flow failed'));
  }
}
