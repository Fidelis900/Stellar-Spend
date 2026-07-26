import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  validateSplit,
  computeSplitAmounts,
  SplitStorage,
  calculateSplitFees,
  reconcileSplit,
  type SplitRecipient,
  type SplitTransaction,
} from '@/lib/transaction-split';
import { withIdempotency } from '@/lib/idempotency';

// GET: fetch split, reconciliation, or analytics
export async function GET(req: NextRequest) {
  try {
    const splitId = req.nextUrl.searchParams.get('splitId');
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'analytics') {
      return NextResponse.json({ analytics: SplitStorage.getAnalytics() });
    }

    if (action === 'reconcile' && splitId) {
      const reconciliation = reconcileSplit(splitId);
      if (!reconciliation) return ErrorHandler.notFound("Split");
      return NextResponse.json({ reconciliation });
    }

    if (splitId) {
      const split = SplitStorage.getById(splitId);
      if (!split) return ErrorHandler.notFound("Split");
      return NextResponse.json({ split });
    }

    return NextResponse.json({ splits: SplitStorage.getAll() });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

// POST: create a new split transaction
export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const { totalAmount, currency, recipients } = await req.json();

      if (!totalAmount || !currency || !recipients) {
        return ErrorHandler.validation('Missing required fields: totalAmount, currency, recipients');
      }

      if (!Array.isArray(recipients) || recipients.length === 0) {
        return ErrorHandler.validation('recipients must be a non-empty array');
      }

      const validationError = validateSplit(recipients as SplitRecipient[]);
      if (validationError) {
        return ErrorHandler.validation(validationError);
      }

      const fees = calculateSplitFees(totalAmount, recipients.length);
      if (fees.netAmount <= 0) {
        return ErrorHandler.validation('Amount too small to cover split fees');
      }

      const splitId = SplitStorage.generateId();
      const recipientsWithAmounts = computeSplitAmounts(String(fees.netAmount), recipients as SplitRecipient[]);

      const split: SplitTransaction = {
        id: splitId,
        createdAt: Date.now(),
        totalAmount: String(totalAmount),
        currency,
        recipients: recipientsWithAmounts,
        status: 'pending',
        results: {},
      };

      SplitStorage.save(split);

      return NextResponse.json({
        success: true,
        splitId,
        fees,
        split,
      });
    } catch (error) {
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}

// PATCH: update recipient result (partial failure handling)
export async function PATCH(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const { splitId, recipientId, status, error: recipientError } = await req.json();

      if (!splitId || !recipientId || !status) {
        return ErrorHandler.validation('Missing required fields: splitId, recipientId, status');
      }

      if (!['completed', 'failed'].includes(status)) {
        return ErrorHandler.validation('status must be "completed" or "failed"');
      }

      const split = SplitStorage.getById(splitId);
      if (!split) return ErrorHandler.notFound("Split");

      SplitStorage.updateResult(splitId, recipientId, { status, error: recipientError });

      const updated = SplitStorage.getById(splitId);
      return NextResponse.json({ success: true, split: updated });
    } catch (error) {
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}
