import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { merchantService } from '@/lib/services/merchant.service';

// GET /api/merchant/payouts/[payoutId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ payoutId: string }> }
) {
  const { payoutId } = await params;

  try {
    const payout = await merchantService.getBulkPayoutStatus(payoutId);
    if (!payout) return ErrorHandler.notFound('Payout');
    return NextResponse.json({ data: payout });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
