import { describe, it, expect, afterEach, vi } from 'vitest';
import { ErrorHandler } from '@/lib/error-handler';
import { ErrorType } from '@/lib/error-types';

async function parseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json();
}

describe('ErrorHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('handle method', () => {
    it('should return standard error format with error field', async () => {
      const body = await parseBody(ErrorHandler.handle(new Error('Test error')));
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
      expect((body.error as string).length).toBeGreaterThan(0);
    });

    it('should include message field when available', async () => {
      const body = await parseBody(ErrorHandler.handle(new Error('Test message')));
      expect(body).toHaveProperty('message');
      expect(body.message).toBe('Test message');
    });

    it('should include details in development environment', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const body = await parseBody(ErrorHandler.handle(new Error('Test error')));
      expect(body).toHaveProperty('details');
    });

    it('should exclude details in production environment', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const body = await parseBody(ErrorHandler.handle(new Error('Test error')));
      expect(body).not.toHaveProperty('details');
    });

    it('should handle string input', async () => {
      const body = await parseBody(ErrorHandler.handle('String error'));
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body.message).toBe('String error');
    });

    it('should handle malformed input gracefully', async () => {
      const body = await parseBody(ErrorHandler.handle(null));
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });
  });

  describe('validation method', () => {
    it('should return 400 status code', () => {
      expect(ErrorHandler.validation('Invalid field').status).toBe(400);
    });

    it('should return validation_error type', async () => {
      const body = await parseBody(ErrorHandler.validation('Invalid field'));
      expect(body.error).toBe(ErrorType.VALIDATION);
    });
  });

  describe('notFound method', () => {
    it('should return 404 status code', () => {
      expect(ErrorHandler.notFound().status).toBe(404);
    });

    it('should return not_found type', async () => {
      const body = await parseBody(ErrorHandler.notFound());
      expect(body.error).toBe(ErrorType.NOT_FOUND);
    });
  });

  describe('unauthorized method', () => {
    it('should return 401 status code', () => {
      expect(ErrorHandler.unauthorized().status).toBe(401);
    });

    it('should return unauthorized type', async () => {
      const body = await parseBody(ErrorHandler.unauthorized());
      expect(body.error).toBe(ErrorType.UNAUTHORIZED);
    });
  });

  describe('serverError method', () => {
    it('should return 500 status code', () => {
      expect(ErrorHandler.serverError().status).toBe(500);
    });

    it('should return server_error type', async () => {
      const body = await parseBody(ErrorHandler.serverError());
      expect(body.error).toBe(ErrorType.SERVER_ERROR);
    });

    it('should use generic message in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const body = await parseBody(ErrorHandler.serverError(new Error('Sensitive error')));
      expect(body.message).toBe('Internal server error');
    });

    it('should include actual message in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const body = await parseBody(ErrorHandler.serverError(new Error('Detailed error')));
      expect(body.message).toBe('Detailed error');
    });
  });

  describe('security filtering', () => {
    it('should sanitize file paths', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const body = await parseBody(ErrorHandler.handle(new Error('Error in /path/to/file.ts')));
      expect(body.message).toContain('[file]');
      expect(body.message).not.toContain('/path/to/file.ts');
    });

    it('should sanitize connection strings', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const body = await parseBody(
        ErrorHandler.handle(new Error('Connection failed: mongodb://user:pass@host/db')),
      );
      expect(body.message).toContain('[connection_string]');
      expect(body.message).not.toContain('mongodb://user:pass@host/db');
    });

    it('should sanitize API keys', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const body = await parseBody(
        ErrorHandler.handle(new Error('API key abc123def456ghi789jkl012mno345pqr failed')),
      );
      expect(body.message).toContain('[api_key]');
      expect(body.message).not.toContain('abc123def456ghi789jkl012mno345pqr');
    });
  });

  describe('JSON parsing validity', () => {
    it('should produce valid JSON that can be parsed', async () => {
      const body = await parseBody(ErrorHandler.handle(new Error('Test error')));
      expect(body).toHaveProperty('error');
    });
  });
});
