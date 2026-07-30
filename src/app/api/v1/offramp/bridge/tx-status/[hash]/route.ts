import { NextRequest } from 'next/server';
import { GET as baseGET } from '@/app/api/offramp/bridge/tx-status/[hash]/route';
import { withApiKeyAuth } from '@/lib/api-keys';

export async function GET(request: NextRequest, context: { params: Promise<{ hash: string }> }) {
  return withApiKeyAuth(request, async () => baseGET(request, context));
}
