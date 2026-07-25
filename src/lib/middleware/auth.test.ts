import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { authMiddleware } from './auth';

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: new Headers(headers) });
}

describe('authMiddleware', () => {
  it('handles versioned API path /api/v1/*', () => {
    const req = makeRequest('/api/v1/transactions');
    const res = authMiddleware(req);
    expect(res).not.toBeNull();
    expect(res!.headers.get('X-API-Version')).toBe('1');
  });

  it('returns 404 for unknown API version', () => {
    const req = makeRequest('/api/v999/transactions');
    const res = authMiddleware(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('rewrites unversioned path with X-API-Version header', () => {
    const req = makeRequest('/api/transactions', { 'x-api-version': '1' });
    const res = authMiddleware(req);
    expect(res).not.toBeNull();
  });

  it('adds deprecation headers for legacy routes', () => {
    const req = makeRequest('/api/transactions');
    const res = authMiddleware(req);
    expect(res).not.toBeNull();
    expect(res!.headers.get('Deprecation')).toBe('2025-01-01');
    expect(res!.headers.get('Sunset')).toBe('2026-01-01');
  });

  it('returns null for non-API paths', () => {
    const req = makeRequest('/health');
    const res = authMiddleware(req);
    expect(res).toBeNull();
  });
});
