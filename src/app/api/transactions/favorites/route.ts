import { NextRequest, NextResponse } from 'next/server';
import { TransactionStorage } from '@/lib/transaction-storage';
import { ErrorHandler } from '@/lib/error-handler';

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet');

    if (!wallet) {
      return ErrorHandler.validation('Missing wallet parameter');
    }

    const favorites = TransactionStorage.getFavoritesByUser(wallet);
    return NextResponse.json(favorites);
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { transactionId } = await req.json();

    if (!transactionId) {
      return ErrorHandler.validation('Missing transactionId');
    }

    const tx = TransactionStorage.getById(transactionId);
    if (!tx) {
      return ErrorHandler.notFound("Transaction");
    }

    TransactionStorage.toggleFavorite(transactionId);

    return NextResponse.json({
      success: true,
      isFavorite: TransactionStorage.getById(transactionId)?.isFavorite,
    });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
