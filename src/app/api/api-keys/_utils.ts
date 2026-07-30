import { NextRequest } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { hasApiKeyAdminToken, isValidAdminToken } from '@/lib/api-keys';

export function requireApiKeyAdmin(request: NextRequest) {
  if (!hasApiKeyAdminToken()) {
    return ErrorHandler.serverError(new Error('API key admin token is not configured'));
  }

  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  if (!isValidAdminToken(token)) {
    return ErrorHandler.unauthorized('Invalid admin token');
  }

  return null;
}
