import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  getFeatureFlags,
  setFlagOverrides,
  clearFlagOverrides,
} from '@/lib/feature-flags';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const userId = request.nextUrl.searchParams.get('userId') ?? undefined;

  try {
    const flags = await getFeatureFlags(userId);
    return NextResponse.json({ data: flags });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function PUT(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  try {
    await setFlagOverrides(body as any);
    return NextResponse.json({ data: { message: 'Feature flag overrides applied' } });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    await clearFlagOverrides();
    return NextResponse.json({ data: { message: 'Feature flag overrides cleared' } });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
