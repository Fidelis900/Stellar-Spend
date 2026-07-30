import { NextRequest } from 'next/server';
import { POST as basePOST } from '@/app/api/offramp/fees/route';
import { withApiKeyAuth } from '@/lib/api-keys';

export async function POST(request: NextRequest) {
  return withApiKeyAuth(request, async () => basePOST(request));
}
