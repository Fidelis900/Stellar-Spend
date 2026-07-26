import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import {
  scheduleTransaction,
  getScheduledTransactions,
  cancelScheduledTransaction,
  updateScheduledTransaction,
} from '@/lib/services/scheduling.service';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const { userId, amount, currency, scheduledFor, action, scheduledId } =
        await req.json();

      if (action === 'schedule') {
        const scheduled = await scheduleTransaction(
          userId,
          amount,
          currency,
          new Date(scheduledFor)
        );
        return NextResponse.json({ scheduled });
      }

      if (action === 'cancel') {
        await cancelScheduledTransaction(scheduledId);
        return NextResponse.json({ status: 'cancelled' });
      }

      if (action === 'update') {
        const updated = await updateScheduledTransaction(
          scheduledId,
          new Date(scheduledFor)
        );
        return NextResponse.json({ updated: updated.rows[0] });
      }

      return ErrorHandler.validation('Invalid action');
    } catch {
      return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to process scheduled transaction'));
    }
  }, { required: true });
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return ErrorHandler.validation('Missing userId');
    }

    const scheduled = await getScheduledTransactions(userId);
    return NextResponse.json({ scheduled });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to get scheduled transactions'));
  }
}
