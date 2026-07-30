import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { merchantService, type BulkPayoutItem } from '@/lib/services';
import { createBulkPayoutSchema, formatZodErrors } from '@/lib/validators';
import { ApiError, ErrorType } from '@/lib/error-types';

// GET /api/merchant/payouts?merchantId=&page=&limit=
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const merchantId = searchParams.get('merchantId');
  if (!merchantId || merchantId.trim() === '') {
    return ErrorHandler.validation('merchantId is required');
  }

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
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const parsed = createBulkPayoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = formatZodErrors(parsed.error);
    return ErrorHandler.handle(
      new ApiError(ErrorType.VALIDATION, errors[0].message, 400, { errors }),
    );
  }

  const { merchantId, idempotencyKey, items } = parsed.data;

  try {
    const payout = await merchantService.createBulkPayout(
      merchantId,
      idempotencyKey,
      items as BulkPayoutItem[],
    );
    return NextResponse.json({ data: payout }, { status: 201 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
