/**
 * Standard error response interface that all API routes should follow
 */
export interface StandardErrorResponse {
  /** Machine-readable error code or short message */
  error: string;
  /** Human-readable description (optional) */
  message?: string;
  /** Additional context (development only) */
  details?: unknown;
}

/**
 * Internal error context structure for processing
 */
export interface ErrorContext {
  originalError: unknown;
  statusCode: number;
  errorType: ErrorType;
  message?: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * Environment configuration for error handling
 */
export interface EnvironmentConfig {
  isProduction: boolean;
  includeStackTrace: boolean;
  includeDetails: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Error classification for consistent handling
 */
export enum ErrorType {
  VALIDATION = 'validation_error',
  NOT_FOUND = 'not_found',
  UNAUTHORIZED = 'unauthorized',
  FORBIDDEN = 'forbidden',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit_exceeded',
  SERVER_ERROR = 'server_error',
  EXTERNAL_SERVICE = 'external_service_error'
}

/**
 * HTTP status code mapping for error types
 */
export const ERROR_STATUS_CODES: Record<ErrorType, number> = {
  [ErrorType.VALIDATION]: 400,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.UNAUTHORIZED]: 401,
  [ErrorType.FORBIDDEN]: 403,
  [ErrorType.CONFLICT]: 409,
  [ErrorType.RATE_LIMIT]: 429,
  [ErrorType.SERVER_ERROR]: 500,
  [ErrorType.EXTERNAL_SERVICE]: 502
};

/**
 * Utility function to get environment configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    isProduction,
    includeStackTrace: !isProduction,
    includeDetails: !isProduction,
    logLevel: isProduction ? 'error' : 'debug'
  };
}

/**
 * Type guard to check if an object is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if an object has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/**
 * Shared application error type. Throw this (or a subclass-free instance via the
 * static factories below) from route handlers / services and pass it to
 * ErrorHandler.handle() to get the exact code/status/details reflected in the
 * response, instead of relying on message-based classification.
 */
export class ApiError extends Error {
  constructor(
    public readonly errorType: ErrorType,
    message: string,
    public readonly statusCode: number = ERROR_STATUS_CODES[errorType] ?? 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static validation(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(ErrorType.VALIDATION, message, 400, details);
  }

  static notFound(resource?: string): ApiError {
    return new ApiError(ErrorType.NOT_FOUND, resource ? `${resource} not found` : 'Resource not found', 404);
  }

  static unauthorized(message: string = 'Unauthorized access'): ApiError {
    return new ApiError(ErrorType.UNAUTHORIZED, message, 401);
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(ErrorType.FORBIDDEN, message, 403);
  }

  static conflict(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(ErrorType.CONFLICT, message, 409, details);
  }

  static rateLimit(message: string = 'Rate limit exceeded', retryAfter?: number): ApiError {
    return new ApiError(ErrorType.RATE_LIMIT, message, 429, retryAfter ? { retryAfter } : undefined);
  }

  static externalService(service: string, message: string): ApiError {
    return new ApiError(ErrorType.EXTERNAL_SERVICE, `${service} error: ${message}`, 502);
  }

  static server(message: string = 'Internal server error'): ApiError {
    return new ApiError(ErrorType.SERVER_ERROR, message, 500);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}