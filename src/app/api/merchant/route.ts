import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { merchantService } from '@/lib/services/merchant.service';

// GET /api/merchant — get merchant profile by userId query param
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) return ErrorHandler.validation('userId query param is required');

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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const { userId, businessName, businessEmail } = body as Record<string, string>;
  if (!userId || !businessName || !businessEmail) {
    return ErrorHandler.validation('userId, businessName, and businessEmail are required');
  }

  try {
    const merchant = await merchantService.createMerchant(userId, businessName, businessEmail);
    return NextResponse.json({ data: merchant }, { status: 201 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
