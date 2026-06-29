import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { lookupCountry, getCountryOverride, hasDeniedGeoConsent, resolveGeo } from './geoip';

function makeRequest(opts: {
  headers?: Record<string, string>;
  cookie?: string;
}) {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookie) headers.set('cookie', opts.cookie);
  return new NextRequest('http://localhost/api/transactions', { headers });
}

describe('lookupCountry', () => {
  it('reads the Vercel geo header', () => {
    const req = makeRequest({ headers: { 'x-vercel-ip-country': 'NG' } });
    expect(lookupCountry(req)).toBe('NG');
  });

  it('falls back to the Cloudflare geo header', () => {
    const req = makeRequest({ headers: { 'cf-ipcountry': 'ke' } });
    expect(lookupCountry(req)).toBe('KE');
  });

  it('treats Vercel\'s "XX" (unknown) as no country', () => {
    const req = makeRequest({ headers: { 'x-vercel-ip-country': 'XX' } });
    expect(lookupCountry(req)).toBeNull();
  });

  it('returns null when no geo header is present', () => {
    const req = makeRequest({});
    expect(lookupCountry(req)).toBeNull();
  });

  it('caches the result per IP so a repeat lookup with no headers still resolves', () => {
    const ip = '203.0.113.42';
    const first = makeRequest({ headers: { 'x-vercel-ip-country': 'GH', 'x-forwarded-for': ip } });
    expect(lookupCountry(first)).toBe('GH');

    // Same IP, headers stripped (e.g. a different edge node) — should hit the cache.
    const second = makeRequest({ headers: { 'x-forwarded-for': ip } });
    expect(lookupCountry(second)).toBe('GH');
  });
});

describe('getCountryOverride', () => {
  it('prefers the override header over the override cookie', () => {
    const req = makeRequest({ headers: { 'x-geo-override': 'US' }, cookie: 'geo_override=NG' });
    expect(getCountryOverride(req)).toBe('US');
  });

  it('falls back to the override cookie', () => {
    const req = makeRequest({ cookie: 'geo_override=ke' });
    expect(getCountryOverride(req)).toBe('KE');
  });

  it('returns null when no override is set', () => {
    expect(getCountryOverride(makeRequest({}))).toBeNull();
  });
});

describe('hasDeniedGeoConsent', () => {
  it('is true only when the consent cookie is explicitly "denied"', () => {
    expect(hasDeniedGeoConsent(makeRequest({ cookie: 'geo_consent=denied' }))).toBe(true);
    expect(hasDeniedGeoConsent(makeRequest({ cookie: 'geo_consent=granted' }))).toBe(false);
    expect(hasDeniedGeoConsent(makeRequest({}))).toBe(false);
  });
});

describe('resolveGeo', () => {
  it('marks the result as overridden when an override is present', () => {
    const req = makeRequest({ headers: { 'x-vercel-ip-country': 'NG', 'x-geo-override': 'US' } });
    expect(resolveGeo(req)).toEqual({ country: 'US', overridden: true });
  });

  it('falls back to IP-based lookup when there is no override', () => {
    const req = makeRequest({ headers: { 'x-vercel-ip-country': 'NG' } });
    expect(resolveGeo(req)).toEqual({ country: 'NG', overridden: false });
  });
});
