import { NextRequest } from 'next/server';
import { GET as baseGET } from '@/app/api/offramp/paycrest/order/[orderId]/route';
import { withApiKeyAuth } from '@/lib/api-keys';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const resolvedParams = await params;
  return withApiKeyAuth(request, async () => baseGET(request, { params: resolvedParams }));
}
