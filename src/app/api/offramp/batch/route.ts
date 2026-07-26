import { NextRequest, NextResponse } from 'next/server';
import {
  createBatch,
  addTransactionToBatch,
  getBatchStatus,
  getBatchProgress,
  cancelBatch,
  executeBatch,
  getBatchAnalytics,
} from '@/lib/services/batch.service';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const body = await req.json();
      const { action } = body;

      if (action === 'cancel') {
        const { batchId } = body;
        if (!batchId) return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
        const result = await cancelBatch(batchId);
        return NextResponse.json({ batchId, status: 'cancelled', result: result.rows[0] });
      }

      if (action === 'execute') {
        const { batchId } = body;
        if (!batchId) return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
        const result = await executeBatch(batchId, async (payload) => {
          return `tx_${Date.now()}`;
        });
        return NextResponse.json({ batchId, ...result });
      }

      const { userId, transactions } = body;
      const totalAmount = transactions.reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);
      const batch = await createBatch(userId, totalAmount);

      for (const tx of transactions) {
        await addTransactionToBatch(batch.id, tx);
      }

      return NextResponse.json({ batchId: batch.id, status: 'created' });
    } catch (error) {
      return NextResponse.json({ error: 'Failed to process batch request' }, { status: 500 });
    }
  }, { required: true });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const batchId = searchParams.get('batchId');
    const view = searchParams.get('view');
    const userId = searchParams.get('userId');

    if (view === 'analytics') {
      const analytics = await getBatchAnalytics(userId ?? undefined);
      return NextResponse.json(analytics);
    }

    if (!batchId) {
      return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
    }

    if (view === 'progress') {
      const progress = await getBatchProgress(batchId);
      return NextResponse.json(progress);
    }

    const status = await getBatchStatus(batchId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get batch status' }, { status: 500 });
  }
}
