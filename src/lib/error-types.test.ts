import { describe, it, expect, beforeEach } from 'vitest';
import {
  ApiError,
  ErrorType,
  ERROR_STATUS_CODES,
  getEnvironmentConfig,
  isError,
  hasMessage,
  isApiError,
} from './error-types';

describe('error-types.ts', () => {
  describe('ApiError', () => {
    it('should create a validation error with default status code', () => {
      const error = ApiError.validation('Invalid input');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.errorType).toBe(ErrorType.VALIDATION);
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeUndefined();
    });

    it('should create a validation error with details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = ApiError.validation('Invalid email', details);

      expect(error.details).toEqual(details);
    });

    it('should create a notFound error without resource', () => {
      const error = ApiError.notFound();

      expect(error.errorType).toBe(ErrorType.NOT_FOUND);
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create a notFound error with resource', () => {
      const error = ApiError.notFound('User');

      expect(error.message).toBe('User not found');
    });

    it('should create an unauthorized error with default message', () => {
      const error = ApiError.unauthorized();

      expect(error.errorType).toBe(ErrorType.UNAUTHORIZED);
      expect(error.message).toBe('Unauthorized access');
      expect(error.statusCode).toBe(401);
    });

    it('should create an unauthorized error with custom message', () => {
      const error = ApiError.unauthorized('Invalid token');

      expect(error.message).toBe('Invalid token');
    });

    it('should create a forbidden error', () => {
      const error = ApiError.forbidden('Access denied');

      expect(error.errorType).toBe(ErrorType.FORBIDDEN);
      expect(error.statusCode).toBe(403);
    });

    it('should create a forbidden error with default message', () => {
      const error = ApiError.forbidden();

      expect(error.message).toBe('Forbidden');
    });

    it('should create a conflict error', () => {
      const error = ApiError.conflict('Resource already exists', { existing: true });

      expect(error.errorType).toBe(ErrorType.CONFLICT);
      expect(error.statusCode).toBe(409);
      expect(error.details).toEqual({ existing: true });
    });

    it('should create a rate limit error without retry info', () => {
      const error = ApiError.rateLimit();

      expect(error.errorType).toBe(ErrorType.RATE_LIMIT);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.details).toBeUndefined();
    });

    it('should create a rate limit error with retry info', () => {
      const error = ApiError.rateLimit('Too many requests', 60);

      expect(error.message).toBe('Too many requests');
      expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('should create an external service error', () => {
      const error = ApiError.externalService('PaycrestAPI', 'Connection timeout');

      expect(error.errorType).toBe(ErrorType.EXTERNAL_SERVICE);
      expect(error.message).toBe('PaycrestAPI error: Connection timeout');
      expect(error.statusCode).toBe(502);
    });

    it('should create a server error with default message', () => {
      const error = ApiError.server();

      expect(error.errorType).toBe(ErrorType.SERVER_ERROR);
      expect(error.message).toBe('Internal server error');
      expect(error.statusCode).toBe(500);
    });

    it('should create a server error with custom message', () => {
      const error = ApiError.server('Database connection failed');

      expect(error.message).toBe('Database connection failed');
    });

    it('should maintain prototype chain', () => {
      const error = ApiError.validation('Test');

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error.name).toBe('ApiError');
    });

    it('should be catchable as Error', () => {
      const error = ApiError.validation('Test');

      try {
        throw error;
      } catch (e) {
        expect(e instanceof Error).toBe(true);
        expect((e as ApiError).errorType).toBe(ErrorType.VALIDATION);
      }
    });

    it('should allow custom status code', () => {
      const error = new ApiError(ErrorType.VALIDATION, 'Custom error', 418);

      expect(error.statusCode).toBe(418);
    });
  });

  describe('ERROR_STATUS_CODES', () => {
    it('should map all error types to correct status codes', () => {
      expect(ERROR_STATUS_CODES[ErrorType.VALIDATION]).toBe(400);
      expect(ERROR_STATUS_CODES[ErrorType.NOT_FOUND]).toBe(404);
      expect(ERROR_STATUS_CODES[ErrorType.UNAUTHORIZED]).toBe(401);
      expect(ERROR_STATUS_CODES[ErrorType.FORBIDDEN]).toBe(403);
      expect(ERROR_STATUS_CODES[ErrorType.CONFLICT]).toBe(409);
      expect(ERROR_STATUS_CODES[ErrorType.RATE_LIMIT]).toBe(429);
      expect(ERROR_STATUS_CODES[ErrorType.SERVER_ERROR]).toBe(500);
      expect(ERROR_STATUS_CODES[ErrorType.EXTERNAL_SERVICE]).toBe(502);
    });
  });

  describe('getEnvironmentConfig', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should return production config in production environment', () => {
      process.env.NODE_ENV = 'production';
      const config = getEnvironmentConfig();

      expect(config.isProduction).toBe(true);
      expect(config.includeStackTrace).toBe(false);
      expect(config.includeDetails).toBe(false);
      expect(config.logLevel).toBe('error');
    });

    it('should return development config in non-production environment', () => {
      process.env.NODE_ENV = 'development';
      const config = getEnvironmentConfig();

      expect(config.isProduction).toBe(false);
      expect(config.includeStackTrace).toBe(true);
      expect(config.includeDetails).toBe(true);
      expect(config.logLevel).toBe('debug');
    });

    it('should return development config when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'test';
      const config = getEnvironmentConfig();

      expect(config.isProduction).toBe(false);
    });
  });

  describe('Type guards', () => {
    describe('isError', () => {
      it('should return true for Error instances', () => {
        expect(isError(new Error('test'))).toBe(true);
        expect(isError(new TypeError('test'))).toBe(true);
        expect(isError(new ApiError(ErrorType.VALIDATION, 'test'))).toBe(true);
      });

      it('should return false for non-Error objects', () => {
        expect(isError({})).toBe(false);
        expect(isError('error')).toBe(false);
        expect(isError(null)).toBe(false);
        expect(isError(undefined)).toBe(false);
        expect(isError(42)).toBe(false);
      });

      it('should return false for objects with message property but not Error', () => {
        expect(isError({ message: 'error' })).toBe(false);
      });
    });

    describe('hasMessage', () => {
      it('should return true for objects with message property', () => {
        expect(hasMessage({ message: 'test' })).toBe(true);
        expect(hasMessage(new Error('test'))).toBe(true);
        expect(hasMessage({ message: '', other: 'field' })).toBe(true);
      });

      it('should return false for null', () => {
        expect(hasMessage(null)).toBe(false);
      });

      it('should return false for objects without message property', () => {
        expect(hasMessage({})).toBe(false);
        expect(hasMessage({ error: 'test' })).toBe(false);
      });

      it('should return false for non-objects', () => {
        expect(hasMessage('string')).toBe(false);
        expect(hasMessage(42)).toBe(false);
        expect(hasMessage(undefined)).toBe(false);
      });
    });

    describe('isApiError', () => {
      it('should return true for ApiError instances', () => {
        expect(isApiError(ApiError.validation('test'))).toBe(true);
        expect(isApiError(ApiError.notFound())).toBe(true);
        expect(isApiError(new ApiError(ErrorType.SERVER_ERROR, 'test'))).toBe(true);
      });

      it('should return false for other Error instances', () => {
        expect(isApiError(new Error('test'))).toBe(false);
        expect(isApiError(new TypeError('test'))).toBe(false);
      });

      it('should return false for non-Error objects', () => {
        expect(isApiError({})).toBe(false);
        expect(isApiError({ errorType: ErrorType.VALIDATION })).toBe(false);
        expect(isApiError('error')).toBe(false);
        expect(isApiError(null)).toBe(false);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle error chain with type guards', () => {
      let error: unknown;

      try {
        throw ApiError.validation('Invalid data');
      } catch (e) {
        error = e;
      }

      expect(isError(error)).toBe(true);
      expect(hasMessage(error)).toBe(true);
      expect(isApiError(error)).toBe(true);

      if (isApiError(error)) {
        expect(error.statusCode).toBe(400);
        expect(error.errorType).toBe(ErrorType.VALIDATION);
      }
    });

    it('should serialize ApiError to JSON-compatible object', () => {
      const error = ApiError.notFound('User');

      const serialized = {
        error: error.errorType,
        message: error.message,
        statusCode: error.statusCode,
      };

      expect(serialized.statusCode).toBe(404);
      expect(serialized.error).toBe(ErrorType.NOT_FOUND);
    });
  });
});
