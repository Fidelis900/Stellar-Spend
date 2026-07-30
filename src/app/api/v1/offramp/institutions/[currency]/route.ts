import { NextRequest } from 'next/server';
import { GET as baseGET } from '@/app/api/offramp/institutions/[currency]/route';
import { withApiKeyAuth } from '@/lib/api-keys';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ currency: string }> },
) {
  return withApiKeyAuth(request, async () => baseGET(request, context));
}
