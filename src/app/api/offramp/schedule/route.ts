import { NextRequest, NextResponse } from 'next/server';
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

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to process scheduled transaction' },
        { status: 500 }
      );
    }
  }, { required: true });
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const scheduled = await getScheduledTransactions(userId);
    return NextResponse.json({ scheduled });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get scheduled transactions' },
      { status: 500 }
    );
  }
}
