import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { merchantService } from '@/lib/services';
import { createMerchantSchema, formatZodErrors } from '@/lib/validators';
import { ApiError, ErrorType } from '@/lib/error-types';

// GET /api/merchant — get merchant profile by userId query param
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId || userId.trim() === '') {
    return ErrorHandler.validation('userId query param is required');
  }

  try {
    const merchant = await merchantService.getMerchantByUserId(userId);
    if (!merchant) return ErrorHandler.notFound('Merchant');
    return NextResponse.json({ data: merchant });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

// POST /api/merchant — create merchant account
export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const parsed = createMerchantSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = formatZodErrors(parsed.error);
    return ErrorHandler.handle(
      new ApiError(ErrorType.VALIDATION, errors[0].message, 400, { errors }),
    );
  }

  const { userId, businessName, businessEmail } = parsed.data;

  try {
    const merchant = await merchantService.createMerchant(userId, businessName, businessEmail);
    return NextResponse.json({ data: merchant }, { status: 201 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
