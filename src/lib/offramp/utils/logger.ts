/**
 * Structured request logging utility
 * Delegates to the centralized logger with correlation ID support.
 */

import { logger, redactSensitive } from '@/lib/logger';

export interface RequestLog {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode?: number;
  duration: number;
  error?: string;
  errorStack?: string;
}

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Log a structured API request via the centralized logger
 */
export function logRequest(log: RequestLog): void {
  const logEntry = {
    ...log,
    timestamp: new Date(log.timestamp).toISOString(),
  };

  const level =
    log.statusCode && log.statusCode >= 500
      ? 'error'
      : log.statusCode && log.statusCode >= 400
        ? 'warn'
        : 'info';

  logger.withContext({ requestId: log.requestId })[level]('request.log', redactSensitive(logEntry));
}

/**
 * Create a request logger middleware.
 * Returns a function that logs request details via the centralized logger.
 */
export function createRequestLogger(requestId: string, method: string, path: string) {
  const startTime = Date.now();

  return {
    requestId,
    logSuccess: (statusCode: number) => {
      const duration = Date.now() - startTime;
      logRequest({
        requestId,
        timestamp: new Date().toISOString(),
        method,
        path,
        statusCode,
        duration,
      });
    },
    logError: (statusCode: number, error: Error | string) => {
      const duration = Date.now() - startTime;
      const errorMessage = typeof error === 'string' ? error : error.message;
      const errorStack = error instanceof Error ? error.stack : undefined;

      logRequest({
        requestId,
        timestamp: new Date().toISOString(),
        method,
        path,
        statusCode,
        duration,
        error: errorMessage,
        errorStack,
      });
    },
  };
}

/**
 * Mask sensitive data in request/response bodies
 */
export function maskRequestBody(body: unknown): unknown {
  return redactSensitive(body);
}
