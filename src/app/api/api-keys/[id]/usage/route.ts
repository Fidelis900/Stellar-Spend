import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { listApiKeyUsage } from '@/lib/api-keys';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const usage = await listApiKeyUsage(id);
    return NextResponse.json({ data: usage }, { status: 200 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
