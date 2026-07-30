import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { getDeliveryLogs, getDeliveryLogById } from '@/lib/webhook';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const subscriptionId = searchParams.get('subscriptionId');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const logs = await getDeliveryLogs(subscriptionId ?? undefined, limit, offset);
    return NextResponse.json({ data: logs });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
