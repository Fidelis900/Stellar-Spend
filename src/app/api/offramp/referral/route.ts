import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import {
  createReferralCode,
  getReferralCode,
  trackReferral,
  getReferralStats,
  distributeReward,
  getReferralAnalytics,
  getReferralLeaderboard,
  detectReferralFraud,
} from '@/lib/services/referral.service';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const { userId, action, referralCode, referralId, limit } = await req.json();

      if (action === 'generate') {
        const code = await createReferralCode(userId);
        return NextResponse.json({ code });
      }

      if (action === 'track') {
        if (!referralCode || !userId) {
          return ErrorHandler.validation('Missing referralCode or userId');
        }

        const fraudCheck = await detectReferralFraud(userId, referralCode);
        if (fraudCheck.suspicious) {
          return ErrorHandler.handle(new ApiError(ErrorType.VALIDATION, 'Referral flagged', 422, { reasons: fraudCheck.reasons }));
        }

        const reward = await trackReferral(referralCode, userId);
        return NextResponse.json({ reward });
      }

      if (action === 'distribute') {
        if (!referralId) {
          return ErrorHandler.validation('Missing referralId');
        }
        const distributed = await distributeReward(referralId);
        return NextResponse.json({ distributed });
      }

      if (action === 'leaderboard') {
        const leaderboard = await getReferralLeaderboard(limit ?? 10);
        return NextResponse.json({ leaderboard });
      }

      return ErrorHandler.validation('Invalid action');
    } catch {
      return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to process referral'));
    }
  }, { required: true });
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return ErrorHandler.validation('Missing userId');
    }

    const view = req.nextUrl.searchParams.get('view');

    if (view === 'analytics') {
      const analytics = await getReferralAnalytics(userId);
      return NextResponse.json({ analytics });
    }

    const code = await getReferralCode(userId);
    const stats = await getReferralStats(userId);

    return NextResponse.json({ code, stats });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to get referral data'));
  }
}
