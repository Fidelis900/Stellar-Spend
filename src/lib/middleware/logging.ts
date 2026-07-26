import { NextRequest, NextResponse } from 'next/server';
import { recordApiTiming } from '../performance';
import { logger } from '../logger';

export function createLoggingMiddleware() {
  return (request: NextRequest, response: NextResponse, durationMs: number, requestId?: string): NextResponse => {
    const { pathname } = request.nextUrl;
    requestId ??= request.headers.get('x-request-id') ?? crypto.randomUUID();

    recordApiTiming({
      route: pathname.replace(/\/[0-9a-f-]{8,}/gi, '/:id'),
      method: request.method,
      durationMs,
      statusCode: response.status,
      timestamp: Date.now() - durationMs,
    });

    const log = logger.withContext({ requestId });
    const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';
    log[level]('http.request', { method: request.method, path: pathname, status: response.status, durationMs });

    response.headers.set('X-Request-Id', requestId);
    return response;
  };
}
