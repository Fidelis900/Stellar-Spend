import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { getFunnelCounts } from '@/lib/performance';
import { buildFunnelData } from '@/lib/funnel';
import type { FunnelStep } from '@/lib/funnel';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.headers.get('x-user-address');
    if (!userAddress) {
      return ErrorHandler.unauthorized('User address required');
    }

    const startDate = parseInt(req.nextUrl.searchParams.get('startDate') || '0');
    const endDate = parseInt(req.nextUrl.searchParams.get('endDate') || Date.now().toString());

    if (!startDate || !endDate) {
      return ErrorHandler.validation('startDate and endDate are required');
    }

    const svc = await globalContainer.resolve(SERVICE_KEYS.ANALYTICS_SERVICE);
    const analytics = await svc.getAnalytics(userAddress, startDate, endDate);
    const funnel = buildFunnelData(getFunnelCounts() as Partial<Record<FunnelStep, number>>);

    return NextResponse.json({ ...analytics, funnel });
  } catch (error) {
    logger.error('Error fetching analytics:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch analytics'));
  }
}
