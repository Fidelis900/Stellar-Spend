import { NextRequest, NextResponse } from 'next/server';
import { resolveGeo, hasDeniedGeoConsent } from '@/lib/geo/geoip';
import { getJurisdictionStatus } from '@/lib/kyc-limits';
import { getDefaultCurrencyForCountry } from '@/lib/currencies';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const geo = resolveGeo(request);
  const jurisdictionStatus = geo.country ? getJurisdictionStatus(geo.country) : 'allowed';
  const consentDenied = hasDeniedGeoConsent(request);

  const defaultCurrency = !consentDenied && geo.country
    ? getDefaultCurrencyForCountry(geo.country)?.code
    : undefined;

  return NextResponse.json({
    country: geo.country,
    overridden: geo.overridden,
    jurisdictionStatus,
    defaultCurrency,
  });
}
