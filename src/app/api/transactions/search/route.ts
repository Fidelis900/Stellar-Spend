import { NextRequest, NextResponse } from 'next/server';
import { TransactionStorage } from '@/lib/transaction-storage';
import { TransactionSearchService, type SearchFilters } from '@/lib/transaction-search';
import { ErrorHandler } from '@/lib/error-handler';

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet');
    const query = req.nextUrl.searchParams.get('q');
    const status = req.nextUrl.searchParams.get('status');
    const dateFrom = req.nextUrl.searchParams.get('dateFrom');
    const dateTo = req.nextUrl.searchParams.get('dateTo');
    const amountMin = req.nextUrl.searchParams.get('amountMin');
    const amountMax = req.nextUrl.searchParams.get('amountMax');
    const currency = req.nextUrl.searchParams.get('currency');
    const isFavorite = req.nextUrl.searchParams.get('isFavorite');

    if (!wallet) {
      return ErrorHandler.validation('Missing wallet parameter');
    }

    const userTransactions = TransactionStorage.getByUser(wallet);

    const filters: SearchFilters = {
      query: query || undefined,
      status: (status as any) || 'all',
      dateFrom: dateFrom ? parseInt(dateFrom) : undefined,
      dateTo: dateTo ? parseInt(dateTo) : undefined,
      amountMin: amountMin ? parseFloat(amountMin) : undefined,
      amountMax: amountMax ? parseFloat(amountMax) : undefined,
      currency: currency || undefined,
      isFavorite: isFavorite ? isFavorite === 'true' : undefined,
    };

    const results = TransactionSearchService.search(userTransactions, filters);

    return NextResponse.json({
      results,
      count: results.length,
      total: userTransactions.length,
    });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
