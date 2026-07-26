import { NextResponse } from 'next/server';
import {
  StandardErrorResponse,
  ErrorContext,
  ErrorType,
  ERROR_STATUS_CODES,
  ApiError,
  getEnvironmentConfig,
  isError,
  hasMessage
} from './error-types';
import { TimeoutError } from './offramp/utils/timeout';
import { PaycrestHttpError } from './offramp/adapters/paycrest-adapter';

/**
 * Centralized error handler for standardized API error responses
 */
export class ErrorHandler {
  /**
   * Main error handling method that processes any error and returns a standardized response
   */
  static handle(error: unknown, statusCode?: number): NextResponse<StandardErrorResponse> {
    // Preserve the exact type/status/details for errors raised via ApiError factories
    if (error instanceof ApiError) {
      const context: ErrorContext = {
        originalError: error,
        statusCode: error.statusCode,
        errorType: error.errorType,
        message: error.message,
        details: error.details,
      };
      const response = this.formatResponse(context);
      return NextResponse.json(response, { status: error.statusCode });
    }

    // Handle timeout errors specifically
    if (error instanceof TimeoutError) {
      return this.timeout(error);
    }

    // Preserve HTTP status from Paycrest errors
    if (error instanceof PaycrestHttpError) {
      const context: ErrorContext = {
        originalError: error,
        statusCode: error.status,
        errorType: this.classifyError(error, error.status),
        message: error.message,
        details: error.details as Record<string, unknown> | undefined,
      };
      const response = this.formatResponse(context);
      return NextResponse.json(response, { status: error.status });
    }

    const context = this.createErrorContext(error, statusCode);
    const response = this.formatResponse(context);
    
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Handle validation errors with consistent formatting
   */
  static validation(message: string, field?: string): NextResponse<StandardErrorResponse> {
    const errorMessage = field ? `Validation failed for field: ${field}` : message;
    const context: ErrorContext = {
      originalError: new Error(errorMessage),
      statusCode: ERROR_STATUS_CODES[ErrorType.VALIDATION],
      errorType: ErrorType.VALIDATION,
      message: errorMessage
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Handle not found errors
   */
  static notFound(resource?: string): NextResponse<StandardErrorResponse> {
    const message = resource ? `${resource} not found` : 'Resource not found';
    const context: ErrorContext = {
      originalError: new Error(message),
      statusCode: ERROR_STATUS_CODES[ErrorType.NOT_FOUND],
      errorType: ErrorType.NOT_FOUND,
      message
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Handle unauthorized errors
   */
  static unauthorized(message?: string): NextResponse<StandardErrorResponse> {
    const errorMessage = message || 'Unauthorized access';
    const context: ErrorContext = {
      originalError: new Error(errorMessage),
      statusCode: ERROR_STATUS_CODES[ErrorType.UNAUTHORIZED],
      errorType: ErrorType.UNAUTHORIZED,
      message: errorMessage
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Handle forbidden errors
   */
  static forbidden(message?: string): NextResponse<StandardErrorResponse> {
    const errorMessage = message || 'Forbidden';
    const context: ErrorContext = {
      originalError: new Error(errorMessage),
      statusCode: ERROR_STATUS_CODES[ErrorType.FORBIDDEN],
      errorType: ErrorType.FORBIDDEN,
      message: errorMessage
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Handle conflict errors (duplicate resource, invalid state transition, etc.)
   */
  static conflict(message: string, details?: Record<string, unknown>): NextResponse<StandardErrorResponse> {
    const context: ErrorContext = {
      originalError: new Error(message),
      statusCode: ERROR_STATUS_CODES[ErrorType.CONFLICT],
      errorType: ErrorType.CONFLICT,
      message,
      details: getEnvironmentConfig().includeDetails ? details : undefined
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Handle rate limit errors, optionally setting a Retry-After header
   */
  static rateLimit(message?: string, retryAfter?: number): NextResponse<StandardErrorResponse> {
    const errorMessage = message || 'Rate limit exceeded';
    const context: ErrorContext = {
      originalError: new Error(errorMessage),
      statusCode: ERROR_STATUS_CODES[ErrorType.RATE_LIMIT],
      errorType: ErrorType.RATE_LIMIT,
      message: errorMessage
    };

    const response = this.formatResponse(context);
    const nextResponse = NextResponse.json(response, { status: context.statusCode });
    if (retryAfter) {
      nextResponse.headers.set('Retry-After', retryAfter.toString());
    }
    return nextResponse;
  }

  /**
   * Handle timeout errors with 504 Gateway Timeout
   */
  static timeout(error: TimeoutError): NextResponse<StandardErrorResponse> {
    const context: ErrorContext = {
      originalError: error,
      statusCode: 504,
      errorType: ErrorType.SERVER_ERROR,
      message: error.message
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: 504 });
  }
  static serverError(error?: unknown): NextResponse<StandardErrorResponse> {
    const config = getEnvironmentConfig();
    const message = config.isProduction 
      ? 'Internal server error' 
      : (isError(error) ? error.message : 'Internal server error');

    const context: ErrorContext = {
      originalError: error || new Error('Internal server error'),
      statusCode: ERROR_STATUS_CODES[ErrorType.SERVER_ERROR],
      errorType: ErrorType.SERVER_ERROR,
      message
    };

    const response = this.formatResponse(context);
    return NextResponse.json(response, { status: context.statusCode });
  }

  /**
   * Create error context from various input types
   */
  private static createErrorContext(error: unknown, statusCode?: number): ErrorContext {
    const config = getEnvironmentConfig();
    
    // Handle different input types
    if (isError(error)) {
      return {
        originalError: error,
        statusCode: statusCode || ERROR_STATUS_CODES[ErrorType.SERVER_ERROR],
        errorType: this.classifyError(error, statusCode),
        message: error.message,
        stack: error.stack,
        details: config.includeDetails ? { stack: error.stack } : undefined
      };
    }

    if (typeof error === 'string') {
      return {
        originalError: error,
        statusCode: statusCode || ERROR_STATUS_CODES[ErrorType.SERVER_ERROR],
        errorType: this.classifyError(error, statusCode),
        message: error
      };
    }

    if (hasMessage(error)) {
      return {
        originalError: error,
        statusCode: statusCode || ERROR_STATUS_CODES[ErrorType.SERVER_ERROR],
        errorType: this.classifyError(error, statusCode),
        message: error.message,
        details: config.includeDetails ? error : undefined
      };
    }

    // Fallback for unknown error types
    return {
      originalError: error,
      statusCode: statusCode || ERROR_STATUS_CODES[ErrorType.SERVER_ERROR],
      errorType: ErrorType.SERVER_ERROR,
      message: 'An unexpected error occurred'
    };
  }

  /**
   * Classify error type based on error content and status code
   */
  private static classifyError(error: unknown, statusCode?: number): ErrorType {
    if (statusCode) {
      if (statusCode === 400) return ErrorType.VALIDATION;
      if (statusCode === 401) return ErrorType.UNAUTHORIZED;
      if (statusCode === 403) return ErrorType.FORBIDDEN;
      if (statusCode === 404) return ErrorType.NOT_FOUND;
      if (statusCode === 409) return ErrorType.CONFLICT;
      if (statusCode === 429) return ErrorType.RATE_LIMIT;
      if (statusCode >= 500) return ErrorType.SERVER_ERROR;
    }

    if (isError(error)) {
      const message = error.message.toLowerCase();
      if (message.includes('validation') || message.includes('invalid')) {
        return ErrorType.VALIDATION;
      }
      if (message.includes('not found') || message.includes('missing')) {
        return ErrorType.NOT_FOUND;
      }
      if (message.includes('unauthorized') || message.includes('authentication')) {
        return ErrorType.UNAUTHORIZED;
      }
      if (message.includes('forbidden') || message.includes('permission')) {
        return ErrorType.FORBIDDEN;
      }
    }

    return ErrorType.SERVER_ERROR;
  }

  /**
   * Format the error response according to the standard structure
   */
  private static formatResponse(context: ErrorContext): StandardErrorResponse {
    const config = getEnvironmentConfig();
    const response: StandardErrorResponse = {
      error: context.errorType
    };

    // Add message if available
    if (context.message) {
      response.message = this.sanitizeMessage(context.message);
    }

    // Add details only in development
    if (config.includeDetails && context.details) {
      response.details = this.sanitizeDetails(context.details);
    } else if (config.includeDetails && context.stack) {
      response.details = { stack: context.stack };
    }

    return response;
  }

  /**
   * Sanitize error messages to remove sensitive information
   */
  private static sanitizeMessage(message: string): string {
    // Remove file paths
    message = message.replace(/\/[^\s]+\.(js|ts|jsx|tsx|json)/g, '[file]');
    
    // Remove connection strings
    message = message.replace(/mongodb:\/\/[^\s]+/g, '[connection_string]');
    message = message.replace(/postgres:\/\/[^\s]+/g, '[connection_string]');
    
    // Remove API keys and tokens
    message = message.replace(/[a-zA-Z0-9]{32,}/g, '[api_key]');
    
    return message;
  }

  /**
   * Sanitize details object to remove sensitive information
   */
  private static sanitizeDetails(details: unknown): unknown {
    if (typeof details === 'string') {
      return this.sanitizeMessage(details);
    }

    if (Array.isArray(details)) {
      return details.map(item => this.sanitizeDetails(item));
    }

    if (typeof details === 'object' && details !== null) {
      const sanitized: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(details)) {
        // Skip sensitive keys
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[redacted]';
        } else {
          sanitized[key] = this.sanitizeDetails(value);
        }
      }
      
      return sanitized;
    }

    return details;
  }

  /**
   * Check if a key contains sensitive information
   */
  private static isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'auth', 'credential',
      'connection', 'database', 'db', 'mongo', 'postgres', 'redis'
    ];
    
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
  }
}