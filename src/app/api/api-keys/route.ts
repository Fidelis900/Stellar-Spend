import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { createApiKey, listApiKeys } from '@/lib/api-keys';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';
import { SCOPE_CATALOG, type Scope } from '@/lib/api-keys';

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const apiKeys = await listApiKeys();
    return NextResponse.json({ data: apiKeys }, { status: 200 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  if (!body.name || typeof body.name !== 'string') {
    return ErrorHandler.validation('name is required');
  }

  if (
    body.rateLimitMaxRequests !== undefined &&
    (typeof body.rateLimitMaxRequests !== 'number' || body.rateLimitMaxRequests <= 0)
  ) {
    return ErrorHandler.validation('rateLimitMaxRequests must be a positive number');
  }

  if (
    body.rateLimitWindowMs !== undefined &&
    (typeof body.rateLimitWindowMs !== 'number' || body.rateLimitWindowMs <= 0)
  ) {
    return ErrorHandler.validation('rateLimitWindowMs must be a positive number');
  }

  let scopes: Scope[] | undefined;
  if (body.scopes !== undefined) {
    if (!Array.isArray(body.scopes)) {
      return ErrorHandler.validation('scopes must be an array');
    }
    const validScopeKeys = Object.keys(SCOPE_CATALOG) as Scope[];
    for (const s of body.scopes) {
      if (!validScopeKeys.includes(s as Scope)) {
        return ErrorHandler.validation(
          `Invalid scope: "${s}". Valid scopes: ${validScopeKeys.join(', ')}`,
        );
      }
    }
    scopes = body.scopes as Scope[];
  }

  try {
    const apiKey = await createApiKey({
      name: body.name,
      scopes,
      rateLimitMaxRequests:
        typeof body.rateLimitMaxRequests === 'number' ? body.rateLimitMaxRequests : undefined,
      rateLimitWindowMs:
        typeof body.rateLimitWindowMs === 'number' ? body.rateLimitWindowMs : undefined,
      expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : undefined,
    });

    return NextResponse.json({ data: apiKey }, { status: 201 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
