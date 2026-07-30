/**
 * Geo module exports
 */

export {
  GEO_OVERRIDE_COOKIE,
  GEO_OVERRIDE_HEADER,
  GEO_CONSENT_COOKIE,
  lookupCountry,
  getCountryOverride,
  hasDeniedGeoConsent,
  resolveGeo,
} from './geoip';
export type { ResolvedGeo } from './geoip';
