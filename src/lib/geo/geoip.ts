import type { NextRequest } from 'next/server';

/** Header set by the override flow for VPN/edge-case users who need to pick their corridor manually. */
export const GEO_OVERRIDE_COOKIE = 'geo_override';
export const GEO_OVERRIDE_HEADER = 'x-geo-override';

/** Cookie that opts the user out of geo-based personalization (compliance gating still applies). */
export const GEO_CONSENT_COOKIE = 'geo_consent';

interface CacheEntry {
  country: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const lookupCache = new Map<string, CacheEntry>();

/** Headers populated by edge platforms (Vercel, Cloudflare) with the resolved client country. */
const EDGE_GEO_HEADERS = ['x-vercel-ip-country', 'cf-ipcountry', 'x-country-code'];

function readEdgeCountryHeader(request: NextRequest): string | null {
  for (const header of EDGE_GEO_HEADERS) {
    const value = request.headers.get(header);
    if (value && value.trim() && value.toUpperCase() !== 'XX') {
      return value.trim().toUpperCase();
    }
  }
  return null;
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

/**
 * Resolves the client's country from edge-provided geo headers, caching the
 * result per IP for CACHE_TTL_MS to avoid redundant header parsing on
 * high-traffic IPs (e.g. shared corporate NATs).
 */
export function lookupCountry(request: NextRequest): string | null {
  const ip = getClientIp(request);
  if (ip) {
    const cached = lookupCache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.country;
    }
  }

  const country = readEdgeCountryHeader(request);

  if (ip) {
    lookupCache.set(ip, { country, expiresAt: Date.now() + CACHE_TTL_MS });
    // Bound cache growth; this is a best-effort cache, not a correctness requirement.
    if (lookupCache.size > 5000) {
      const oldestKey = lookupCache.keys().next().value;
      if (oldestKey !== undefined) lookupCache.delete(oldestKey);
    }
  }

  return country;
}

/** Manual override for VPN/edge-case users: explicit header takes precedence over a stored cookie. */
export function getCountryOverride(request: NextRequest): string | null {
  const headerOverride = request.headers.get(GEO_OVERRIDE_HEADER);
  if (headerOverride) return headerOverride.trim().toUpperCase();

  const cookieOverride = request.cookies.get(GEO_OVERRIDE_COOKIE)?.value;
  if (cookieOverride) return cookieOverride.trim().toUpperCase();

  return null;
}

/** Whether the user has opted out of geo-based personalization (currency defaulting). */
export function hasDeniedGeoConsent(request: NextRequest): boolean {
  return request.cookies.get(GEO_CONSENT_COOKIE)?.value === 'denied';
}

export interface ResolvedGeo {
  /** ISO 3166-1 alpha-2 country code, or null if it could not be determined. */
  country: string | null;
  /** True if `country` came from an explicit override rather than IP-based lookup. */
  overridden: boolean;
}

export function resolveGeo(request: NextRequest): ResolvedGeo {
  const override = getCountryOverride(request);
  if (override) {
    return { country: override, overridden: true };
  }
  return { country: lookupCountry(request), overridden: false };
}
