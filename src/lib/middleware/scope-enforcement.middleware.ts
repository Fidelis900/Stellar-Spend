import { NextRequest, NextResponse } from 'next/server';
import { getRequiredScope, hasRequiredScope, type Scope } from '@/lib/api-keys';
import type { ApiKeyRecord } from '@/lib/api-keys/types';
import { auditLoggingService } from '@/lib/audit-logging';
import { ErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

export function enforceScope(request: NextRequest, apiKey: ApiKeyRecord): NextResponse | null {
  const requiredScope = getRequiredScope(request.method, request.nextUrl.pathname);
  if (requiredScope === null) {
    return null;
  }

  if (!hasRequiredScope(apiKey, requiredScope)) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    logger.warn('api_key.scope_denied', {
      apiKeyId: apiKey.id,
      keyPrefix: apiKey.keyPrefix,
      method: request.method,
      path: request.nextUrl.pathname,
      requiredScope,
      assignedScopes: apiKey.scopes,
      ip,
    });

    auditLoggingService.logAction('authorization.denied', 'api_key', 'failure', {
      userAddress: apiKey.id,
      resourceId: request.nextUrl.pathname,
      actionDetails: `Required scope "${requiredScope}" not granted. Assigned: [${apiKey.scopes.join(', ')}]`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return ErrorHandler.unauthorized(
      `API key is missing required scope: "${requiredScope}". This key has scopes: [${apiKey.scopes.join(', ')}]`,
    );
  }

  return null;
}
