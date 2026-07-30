import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { revokeApiKey } from '@/lib/api-keys';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const revoked = await revokeApiKey(
      id,
      typeof body.reason === 'string' ? body.reason : undefined,
    );
    if (!revoked) {
      return ErrorHandler.notFound('api key');
    }

    return NextResponse.json({ data: revoked }, { status: 200 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
