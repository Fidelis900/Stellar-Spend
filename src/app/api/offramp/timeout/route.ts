import { NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { cancelTimedOutTransaction, checkAndCancelTimedOutTransactions, isTransactionTimedOut, TRANSACTION_TIMEOUT_MS } from '@/lib/transaction-timeout';
import { dal } from '@/lib/db/dal';

export const maxDuration = 30;

/**
 * POST /api/offramp/timeout
 * Body: { transactionId: string } — check and cancel a single transaction
 *   OR: { userAddress: string }  — check all pending transactions for a user
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.userAddress && !body.transactionId) {
      const results = await checkAndCancelTimedOutTransactions(body.userAddress);
      return NextResponse.json({ data: results });
    }

    const { transactionId } = body;
    if (!transactionId || typeof transactionId !== 'string') {
      return ErrorHandler.validation('transactionId is required');
    }

    const result = await cancelTimedOutTransaction(transactionId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return ErrorHandler.handle(err);
  }
}

/**
 * GET /api/offramp/timeout?transactionId=xxx
 * Returns timeout status for a transaction.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');
    if (!transactionId) {
      return ErrorHandler.validation('transactionId query param is required');
    }
    const tx = await dal.getById(transactionId);
    if (!tx) {
      return ErrorHandler.notFound('Transaction');
    }
    const ageMs = Date.now() - tx.timestamp;
    return NextResponse.json({
      data: {
        transactionId,
        status: tx.status,
        ageMs,
        timedOut: isTransactionTimedOut(tx),
        timeoutThresholdMs: TRANSACTION_TIMEOUT_MS,
      },
    });
  } catch (err) {
    return ErrorHandler.handle(err);
  }
}
