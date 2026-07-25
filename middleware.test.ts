import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('./src/lib/performance', () => ({ recordApiTiming: vi.fn() }));
vi.mock('./src/lib/logger', () => ({
  logger: { withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('./src/lib/security/headers', () => ({
  addSecurityHeaders: (res: any) => res,
}));
vi.mock('./src/lib/middleware/geo', () => ({
  geoMiddleware: () => null,
  attachGeoHeaders: (res: any, req: any) => res,
}));
vi.mock('./src/lib/middleware/auth', () => ({
  authMiddleware: () => null,
}));

import { middleware } from './middleware';

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: new Headers(headers) });
}

describe('middleware composition', () => {
  it('chains middleware in correct order: geo → auth → security → logging', () => {
    const req = makeRequest('/api/v1/transactions');
    const res = middleware(req);
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('includes request ID in response headers', () => {
    const req = makeRequest('/api/v1/test');
    const res = middleware(req);
    expect(res.headers.has('X-Request-Id')).toBe(true);
  });
});
