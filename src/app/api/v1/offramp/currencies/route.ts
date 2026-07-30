import { NextRequest } from 'next/server';
import { GET as baseGET } from '@/app/api/offramp/currencies/route';
import { withApiKeyAuth } from '@/lib/api-keys';

export async function GET(request: NextRequest) {
  return withApiKeyAuth(request, async () => baseGET(request));
}
