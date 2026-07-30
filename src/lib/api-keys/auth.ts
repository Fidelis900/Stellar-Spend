import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  authenticateApiKey,
  checkApiKeyRateLimit,
  recordApiKeyUsage,
} from '@/lib/api-keys';
import type { ApiKeyRecord } from '@/lib/api-keys/types';
import { getClientIp } from '@/lib/offramp';
import { enforceScope } from '@/lib/middleware';

function extractApiKey(request: NextRequest): string | null {
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) return xApiKey;

  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function withApiKeyAuth(
  request: NextRequest,
  handler: (apiKey: ApiKeyRecord) => Promise<NextResponse>,
): Promise<NextResponse> {
  const rawKey = extractApiKey(request);
  if (!rawKey) {
    return ErrorHandler.unauthorized('API key is required');
  }

  const apiKey = await authenticateApiKey(rawKey);
  if (!apiKey) {
    return ErrorHandler.unauthorized('Invalid API key');
  }

  const rateLimit = checkApiKeyRateLimit(apiKey);
  if (!rateLimit.allowed) {
    await recordApiKeyUsage({
      apiKeyId: apiKey.id,
      method: request.method,
      path: request.nextUrl.pathname,
      statusCode: 429,
      limited: true,
      ipAddress: getClientIp(request),
    });

    const response = NextResponse.json({ error: 'API key rate limit exceeded' }, { status: 429 });
    if (rateLimit.retryAfter) {
      response.headers.set('Retry-After', String(rateLimit.retryAfter));
    }
    response.headers.set('X-API-Key-Id', apiKey.id);
    return response;
  }

  const scopeCheck = enforceScope(request, apiKey);
  if (scopeCheck) {
    await recordApiKeyUsage({
      apiKeyId: apiKey.id,
      method: request.method,
      path: request.nextUrl.pathname,
      statusCode: 403,
      limited: false,
      ipAddress: getClientIp(request),
      metadata: { reason: 'insufficient_scope' },
    });
    return scopeCheck;
  }

  const response = await handler(apiKey);
  response.headers.set('X-API-Key-Id', apiKey.id);

  await recordApiKeyUsage({
    apiKeyId: apiKey.id,
    method: request.method,
    path: request.nextUrl.pathname,
    statusCode: response.status,
    limited: false,
    ipAddress: getClientIp(request),
  });

  return response;
}
