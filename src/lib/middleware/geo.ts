import { NextRequest, NextResponse } from 'next/server';
import { resolveGeo } from '../geo/geoip';
import { isRestrictedJurisdiction } from '../kyc-limits';

const GATED_PATH_RE = /^\/api\/(v\d+\/)?(transactions|onramp|offramp)(\/|$)/;

export function geoMiddleware(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  const geo = resolveGeo(request);
  if (geo.country && !geo.overridden && isRestrictedJurisdiction(geo.country) && GATED_PATH_RE.test(pathname)) {
    return NextResponse.json(
      {
        error: 'Service unavailable in your region',
        country: geo.country,
      },
      { status: 451 }
    );
  }

  return null;
}

export function attachGeoHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const geo = resolveGeo(request);
  if (geo.country) {
    response.headers.set('X-Geo-Country', geo.country);
  }
  return response;
}
