import { NextRequest, NextResponse } from 'next/server';
import { TwoFAService } from '@/lib/two-fa';
import { ErrorHandler } from '@/lib/error-handler';

export async function POST(req: NextRequest) {
  try {
    const { userId, code, method, secret, backupCodes } = await req.json();

    if (!userId || !code || !method) {
      return ErrorHandler.validation('Missing required fields');
    }

    if (method === 'totp') {
      if (!secret) {
        return ErrorHandler.validation('Missing TOTP secret');
      }

      const isValid = TwoFAService.verifyTOTP(secret, code);
      if (!isValid) {
        return ErrorHandler.unauthorized('Invalid TOTP code');
      }

      return NextResponse.json({
        success: true,
        message: '2FA verified successfully',
        verified: true,
      });
    }

    if (method === 'backup') {
      if (!backupCodes) {
        return ErrorHandler.validation('Missing backup codes');
      }

      const { isValid, remainingCodes } = TwoFAService.verifyBackupCode(
        backupCodes,
        [],
        code
      );

      if (!isValid) {
        return ErrorHandler.unauthorized('Invalid backup code');
      }

      return NextResponse.json({
        success: true,
        message: 'Backup code verified',
        verified: true,
        remainingCodes,
      });
    }

    return ErrorHandler.validation('Unsupported verification method');
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
