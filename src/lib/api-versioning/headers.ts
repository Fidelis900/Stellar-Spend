import { NextResponse } from 'next/server';
import type { VersionEntry } from './registry';

export interface VersionHeaderInjector {
  addVersionHeader(response: NextResponse, version: string): NextResponse;
  addDeprecationHeaders(response: NextResponse, entry: VersionEntry): NextResponse;
  addSuccessorLink(response: NextResponse, legacyPath: string): NextResponse;
}

export const headerInjector: VersionHeaderInjector = {
  addVersionHeader(response: NextResponse, version: string): NextResponse {
    // Strip the leading 'v' to get the numeric value, e.g. 'v1' → '1'
    const numericVersion = version.replace(/^v/, '');
    response.headers.set('X-API-Version', numericVersion);
    return response;
  },

  addDeprecationHeaders(response: NextResponse, entry: VersionEntry): NextResponse {
    if (entry.deprecatedAt) {
      response.headers.set('Deprecation', entry.deprecatedAt);
    }
    if (entry.sunsetAt) {
      response.headers.set('Sunset', entry.sunsetAt);
    }
    if (entry.migrationGuideUrl) {
      response.headers.set('Link', `<${entry.migrationGuideUrl}>; rel="deprecation"`);
    }
    return response;
  },

  addSuccessorLink(response: NextResponse, legacyPath: string): NextResponse {
    // Normalise: strip leading slash if present, then build the v1 path
    const cleanPath = legacyPath.replace(/^\//, '');
    const successorUrl = `/api/v1/${cleanPath}`;
    response.headers.set('Link', `<${successorUrl}>; rel="successor-version"`);
    return response;
  },
};
