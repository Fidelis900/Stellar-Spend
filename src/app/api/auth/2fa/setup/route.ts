import { NextRequest, NextResponse } from 'next/server';
import { TwoFAService } from '@/lib/two-fa';
import { ErrorHandler } from '@/lib/error-handler';

const STORAGE_KEY = 'stellar_spend_2fa_config';

export async function POST(req: NextRequest) {
  try {
    const { userId, method } = await req.json();

    if (!userId || !method || !['totp', 'sms'].includes(method)) {
      return ErrorHandler.validation('Invalid userId or method');
    }

    if (method === 'totp') {
      const secret = TwoFAService.generateTOTPSecret();
      const backupCodes = TwoFAService.generateBackupCodes();
      const uri = TwoFAService.generateTOTPURI(secret, userId);

      return NextResponse.json({
        secret,
        uri,
        backupCodes,
        method: 'totp',
      });
    }

    if (method === 'sms') {
      return NextResponse.json({
        method: 'sms',
        message: 'SMS 2FA setup initiated. Provide phone number in verification step.',
      });
    }
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
