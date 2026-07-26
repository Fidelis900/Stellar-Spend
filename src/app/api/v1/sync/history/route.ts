import { NextResponse, type NextRequest } from 'next/server';
import { dal, DatabaseError } from '@/lib/db/dal';
import { ErrorHandler } from '@/lib/error-handler';
import type { Transaction } from '@/lib/transaction-storage';
import { withIdempotency } from '@/lib/idempotency';

const REQUIRED_FIELDS: (keyof Transaction)[] = [
  'id',
  'timestamp',
  'userAddress',
  'amount',
  'currency',
  'beneficiary',
  'status',
];

/**
 * GET /api/v1/sync/history
 * Fetch transaction history for authenticated user
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return ErrorHandler.validation('wallet address is required');
  }

  try {
    // Verify the user is authenticated and can access this wallet
    // TODO: Add authentication check to ensure user owns this wallet
    
    const transactions = await dal.getByUser(wallet);
    
    return NextResponse.json(
      {
        success: true,
        transactions,
        timestamp: Date.now(),
        wallet,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof DatabaseError) {
      return ErrorHandler.serverError(err);
    }
    return ErrorHandler.serverError(err);
  }
}

/**
 * POST /api/v1/sync/history
 * Sync transaction history from client
 * 
 * This endpoint accepts multiple transactions and:
 * 1. Merges them with existing server records
 * 2. Resolves conflicts using last-write-wins strategy
 * 3. Updates server database
 * 4. Returns sync result with conflict info
 */
export async function POST(request: NextRequest) {
  return withIdempotency(request, async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ErrorHandler.validation('Invalid JSON body');
    }

    const wallet = body.wallet as string | undefined;
    const transactions = body.transactions as unknown[] | undefined;
    const timestamp = body.timestamp as number | undefined;

    if (!wallet) {
      return ErrorHandler.validation('wallet address is required');
    }

    if (!Array.isArray(transactions)) {
      return ErrorHandler.validation('transactions array is required');
    }

    if (!timestamp) {
      return ErrorHandler.validation('timestamp is required');
    }

    // TODO: Add authentication check to ensure user owns this wallet

    try {
      const synced: Transaction[] = [];
      const conflicts: Array<{ id: string; reason: string }> = [];

      for (const tx of transactions) {
        // Validate required fields
        for (const field of REQUIRED_FIELDS) {
          if (tx[field as keyof typeof tx] === undefined || tx[field as keyof typeof tx] === null) {
            return ErrorHandler.validation(`Missing required field in transaction: ${String(field)}`);
          }
        }

        const transaction = tx as unknown as Transaction;

        // Verify wallet matches
        if (transaction.userAddress.toLowerCase() !== wallet.toLowerCase()) {
          return ErrorHandler.validation('Transaction wallet does not match request wallet');
        }

        try {
          // Try to save/upsert the transaction
          // The DAL should handle merging with existing records
          await dal.save(transaction);
          synced.push(transaction);
        } catch (err) {
          // Record conflict
          conflicts.push({
            id: transaction.id,
            reason: err instanceof Error ? err.message : 'Failed to save transaction',
          });
        }
      }

      return NextResponse.json(
        {
          success: true,
          synced: synced.length,
          conflicts: conflicts.length,
          conflictDetails: conflicts,
          timestamp: Date.now(),
        },
        { status: 200 }
      );
    } catch (err) {
      if (err instanceof DatabaseError) {
        return ErrorHandler.serverError(err);
      }
      return ErrorHandler.serverError(err);
    }
  }, { required: true });
}
