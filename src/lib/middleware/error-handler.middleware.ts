import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../logger';
import { ERROR_CODES, ERROR_MESSAGES, getStatusCode } from './error-codes';

export interface StandardErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
  requestId: string;
}

export class AppError extends Error {
  constructor(
    public code: string,
    message?: string,
    public details?: Record<string, any>,
  ) {
    super(message || ERROR_MESSAGES[code] || 'Unknown error');
    this.name = 'AppError';
  }
}

export function createErrorResponse(
  error: Error | AppError,
  requestId: string,
): [NextResponse<StandardErrorResponse>, number] {
  let code = ERROR_CODES.INTERNAL_ERROR;
  let message = 'Internal server error';
  let details: Record<string, any> | undefined;

  if (error instanceof AppError) {
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof SyntaxError) {
    code = ERROR_CODES.INVALID_INPUT;
    message = 'Invalid JSON in request body';
  }

  const statusCode = getStatusCode(code);
  const response: StandardErrorResponse = {
    error: { code, message, details },
    timestamp: new Date().toISOString(),
    requestId,
  };

  return [NextResponse.json(response, { status: statusCode }), statusCode];
}

export function errorMiddleware(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      return await handler(req);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const [response, statusCode] = createErrorResponse(err, requestId);

      logger.error('API Error', {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        statusCode,
        error: err.message,
        stack: err.stack,
      });

      return response;
    }
  };
}
