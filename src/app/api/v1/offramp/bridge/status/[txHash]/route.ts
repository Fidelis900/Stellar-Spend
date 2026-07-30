import { NextRequest } from 'next/server';
import { GET as baseGET } from '@/app/api/offramp/bridge/status/[txHash]/route';
import { withApiKeyAuth } from '@/lib/api-keys';

export async function GET(request: NextRequest, context: { params: Promise<{ txHash: string }> }) {
  return withApiKeyAuth(request, async () => baseGET(request, context));
}
