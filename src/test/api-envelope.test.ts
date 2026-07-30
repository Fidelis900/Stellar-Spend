import { describe, it, expect } from 'vitest';
import { successResponse } from '@/lib/api-utils';
import { AppError, createErrorResponse } from '@/lib/middleware';
import { ERROR_CODES } from '@/lib/middleware';

// ---------------------------------------------------------------------------
// successResponse
// ---------------------------------------------------------------------------
describe('successResponse', () => {
  it('wraps data in the canonical success envelope', async () => {
    const res = successResponse({ id: '1', value: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: '1', value: 42 });
    expect(typeof body.timestamp).toBe('string');
  });

  it('accepts a custom HTTP status', async () => {
    const res = successResponse({ created: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createErrorResponse
// ---------------------------------------------------------------------------
describe('createErrorResponse', () => {
  it('returns a structured error envelope', async () => {
    const [res] = createErrorResponse(new Error('boom'), 'req-1');
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(typeof body.timestamp).toBe('string');
    expect(body.requestId).toBe('req-1');
  });

  it('maps AppError fields to envelope', async () => {
    const err = new AppError(ERROR_CODES.INVALID_INPUT, 'bad input', { field: 'amount' });
    const [res] = createErrorResponse(err, 'req-2');
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.INVALID_INPUT);
    expect(body.error.message).toBe('bad input');
    expect(body.error.details).toEqual({ field: 'amount' });
  });

  it('maps AppError SyntaxError to INVALID_INPUT code', async () => {
    const [res] = createErrorResponse(new SyntaxError('bad json'), 'req-3');
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.INVALID_INPUT);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// getStatusCode — error range mapping
// ---------------------------------------------------------------------------
import { getStatusCode } from '@/lib/middleware';

describe('getStatusCode', () => {
  it('returns 400 for validation errors (4001-4009)', () => {
    expect(getStatusCode(ERROR_CODES.INVALID_INPUT)).toBe(400);
    expect(getStatusCode(ERROR_CODES.INVALID_AMOUNT)).toBe(400);
  });

  it('returns 401 for auth errors (4010-4019)', () => {
    expect(getStatusCode(ERROR_CODES.UNAUTHORIZED)).toBe(401);
    expect(getStatusCode(ERROR_CODES.INVALID_API_KEY)).toBe(401);
  });

  it('returns 500 for server errors', () => {
    expect(getStatusCode(ERROR_CODES.INTERNAL_ERROR)).toBe(500);
    expect(getStatusCode(ERROR_CODES.DATABASE_ERROR)).toBe(500);
  });
});
