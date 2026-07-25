import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createLoggingMiddleware } from './logging';

vi.mock('../performance', () => ({
  recordApiTiming: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

describe('loggingMiddleware', () => {
  it('adds request ID header', () => {
    const loggingMiddleware = createLoggingMiddleware();
    const req = new NextRequest('http://localhost/api/v1/test');
    const res = new NextResponse();
    const updated = loggingMiddleware(req, res, 100);
    expect(updated.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('uses existing X-Request-Id header if present', () => {
    const loggingMiddleware = createLoggingMiddleware();
    const req = new NextRequest('http://localhost/api/v1/test', {
      headers: { 'x-request-id': 'existing-id' },
    });
    const res = new NextResponse();
    const updated = loggingMiddleware(req, res, 100);
    expect(updated.headers.get('X-Request-Id')).toBe('existing-id');
  });

  it('normalizes IDs in route path for logging', () => {
    const recordApiTiming = vi.mocked(require('../performance').recordApiTiming);
    const loggingMiddleware = createLoggingMiddleware();
    const req = new NextRequest('http://localhost/api/v1/users/12345678-1234-5678-abcd-123456789abc/transactions');
    const res = new NextResponse();
    loggingMiddleware(req, res, 50);
    expect(recordApiTiming).toHaveBeenCalledWith(
      expect.objectContaining({
        route: expect.stringContaining('/:id'),
        durationMs: 50,
      })
    );
  });
});
