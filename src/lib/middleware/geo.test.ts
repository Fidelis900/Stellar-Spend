import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { geoMiddleware, attachGeoHeaders } from './geo';

vi.mock('../geo/geoip', () => ({
  resolveGeo: (request: NextRequest) => {
    const country = request.headers.get('x-vercel-ip-country');
    const overridden = !!request.headers.get('x-geo-override');
    return { country, overridden };
  },
}));

vi.mock('../kyc-limits', () => ({
  isRestrictedJurisdiction: (country: string) => country === 'KP',
}));

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: new Headers(headers) });
}

describe('geoMiddleware', () => {
  it('blocks restricted jurisdiction on gated endpoints', () => {
    const req = makeRequest('/api/v1/transactions', { 'x-vercel-ip-country': 'KP' });
    const res = geoMiddleware(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(451);
  });

  it('allows restricted jurisdiction with override', () => {
    const req = makeRequest('/api/v1/transactions', {
      'x-vercel-ip-country': 'KP',
      'x-geo-override': 'NG',
    });
    const res = geoMiddleware(req);
    expect(res).toBeNull();
  });

  it('allows allowed jurisdiction', () => {
    const req = makeRequest('/api/v1/transactions', { 'x-vercel-ip-country': 'NG' });
    const res = geoMiddleware(req);
    expect(res).toBeNull();
  });

  it('does not gate non-gated endpoints', () => {
    const req = makeRequest('/api/v1/webhooks/test', { 'x-vercel-ip-country': 'KP' });
    const res = geoMiddleware(req);
    expect(res).toBeNull();
  });
});

describe('attachGeoHeaders', () => {
  it('attaches X-Geo-Country header when country available', () => {
    const req = makeRequest('/api/v1/transactions', { 'x-vercel-ip-country': 'NG' });
    const res = new NextResponse();
    const updated = attachGeoHeaders(res, req);
    expect(updated.headers.get('X-Geo-Country')).toBe('NG');
  });

  it('does not attach header when no country', () => {
    const req = makeRequest('/api/v1/transactions');
    const res = new NextResponse();
    const updated = attachGeoHeaders(res, req);
    expect(updated.headers.get('X-Geo-Country')).toBeNull();
  });
});
