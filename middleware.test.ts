import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('./src/lib/performance', () => ({ recordApiTiming: vi.fn() }));
vi.mock('./src/lib/logger', () => ({
  logger: { withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { middleware } from './middleware';

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: new Headers(headers) });
}

describe('middleware geo gating', () => {
  it('blocks a restricted-jurisdiction request to a gated transaction endpoint', async () => {
    const req = makeRequest('/api/transactions', { 'x-vercel-ip-country': 'KP' });
    const res = middleware(req);
    expect(res.status).toBe(451);
    const body = await res.json();
    expect(body.country).toBe('KP');
  });

  it('allows a restricted-jurisdiction request through an explicit override', () => {
    const req = makeRequest('/api/transactions', {
      'x-vercel-ip-country': 'KP',
      'x-geo-override': 'NG',
    });
    const res = middleware(req);
    expect(res.status).not.toBe(451);
  });

  it('does not gate non-money-movement endpoints (e.g. webhooks)', () => {
    const req = makeRequest('/api/webhooks/paycrest', { 'x-vercel-ip-country': 'KP' });
    const res = middleware(req);
    expect(res.status).not.toBe(451);
  });

  it('passes through requests from an allowed jurisdiction', () => {
    const req = makeRequest('/api/transactions', { 'x-vercel-ip-country': 'NG' });
    const res = middleware(req);
    expect(res.status).not.toBe(451);
    expect(res.headers.get('X-Geo-Country')).toBe('NG');
  });
});
