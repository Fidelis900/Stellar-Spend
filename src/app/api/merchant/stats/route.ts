import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { merchantService } from '@/lib/services/merchant.service';

// GET /api/merchant/stats?merchantId=
export async function GET(request: NextRequest) {
  const merchantId = request.nextUrl.searchParams.get('merchantId');
  if (!merchantId) return ErrorHandler.validation('merchantId is required');

  try {
    const stats = await merchantService.getMerchantStats(merchantId);
    return NextResponse.json({ data: stats });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
