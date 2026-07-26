import { NextRequest, NextResponse } from 'next/server';
import { TransactionStorage } from '@/lib/transaction-storage';
import { TransactionSearchService } from '@/lib/transaction-search';
import { ErrorHandler } from '@/lib/error-handler';

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet');
    const query = req.nextUrl.searchParams.get('q');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '5');

    if (!wallet || !query) {
      return ErrorHandler.validation('Missing wallet or query parameter');
    }

    const userTransactions = TransactionStorage.getByUser(wallet);
    const suggestions = TransactionSearchService.getSearchSuggestions(
      userTransactions,
      query,
      limit
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
