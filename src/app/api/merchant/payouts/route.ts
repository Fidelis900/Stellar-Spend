import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { merchantService, type BulkPayoutItem } from '@/lib/services/merchant.service';

// GET /api/merchant/payouts?merchantId=&page=&limit=
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const merchantId = searchParams.get('merchantId');
  if (!merchantId) return ErrorHandler.validation('merchantId is required');

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  try {
    const result = await merchantService.getMerchantPayouts(merchantId, page, limit);
    return NextResponse.json({ data: result.payouts, total: result.total, page, limit });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

// POST /api/merchant/payouts — create bulk payout
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const { merchantId, idempotencyKey, items } = body as {
    merchantId: string;
    idempotencyKey: string;
    items: BulkPayoutItem[];
  };

  if (!merchantId || !idempotencyKey || !Array.isArray(items) || items.length === 0) {
    return ErrorHandler.validation('merchantId, idempotencyKey, and non-empty items array are required');
  }

  for (const item of items) {
    if (!item.beneficiaryInstitution || !item.beneficiaryAccount || !item.beneficiaryName || !item.amount || !item.currency) {
      return ErrorHandler.validation('Each item must have beneficiaryInstitution, beneficiaryAccount, beneficiaryName, amount, and currency');
    }
  }

  try {
    const payout = await merchantService.createBulkPayout(merchantId, idempotencyKey, items);
    return NextResponse.json({ data: payout }, { status: 201 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
