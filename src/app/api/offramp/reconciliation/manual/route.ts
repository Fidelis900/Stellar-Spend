import { NextResponse, type NextRequest } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
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
        return ErrorHandler.validation('transactionId is required');
      }

      if (!action || !['retry', 'mark_resolved', 'investigate'].includes(action)) {
        return ErrorHandler.validation('action must be one of: retry, mark_resolved, investigate');
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
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}

export async function GET() {
  try {
    const history = await getReconciliationHistory();
    return NextResponse.json({ history });
  } catch (err) {
    logger.error('reconciliation.history_fetch_failed', {}, err);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch reconciliation history'));
  }
}
