import { NextResponse, type NextRequest } from 'next/server';
import {
  performManualReconciliation,
  getReconciliationHistory,
  type ManualReconciliationAction,
} from '@/lib/reconciliation';
import { logger } from '@/lib/logger';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(request: NextRequest) {
  return withIdempotency(request, async () => {
    try {
      const body = await request.json();
      const { transactionId, action, notes, resolvedBy } = body;

      if (!transactionId || typeof transactionId !== 'string') {
        return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
      }

      if (!action || !['retry', 'mark_resolved', 'investigate'].includes(action)) {
        return NextResponse.json(
          { error: 'action must be one of: retry, mark_resolved, investigate' },
          { status: 400 },
        );
      }

      const reconciliationAction: ManualReconciliationAction = {
        transactionId,
        action,
        notes,
        resolvedBy,
      };

      const result = await performManualReconciliation(reconciliationAction);

      return NextResponse.json(result);
    } catch (error) {
      logger.error('manual_reconciliation.error', {}, error);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Failed to perform manual reconciliation',
        },
        { status: 500 },
      );
    }
  }, { required: true });
}

export async function GET() {
  try {
    const history = await getReconciliationHistory();
    return NextResponse.json({ history });
  } catch (err) {
    logger.error('reconciliation.history_fetch_failed', {}, err);
    return NextResponse.json({ error: 'Failed to fetch reconciliation history' }, { status: 500 });
  }
}
