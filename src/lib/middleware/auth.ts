import { NextRequest, NextResponse } from 'next/server';
import { registry } from '../api-versioning/registry';

const VERSIONED_PATH_RE = /^\/api\/(v\d+)(\/.*)?$/;
const UNVERSIONED_API_RE = /^\/api\/(?!v\d+(?:\/|$))(.*)$/;
const ACCEPT_HEADER_RE = /application\/vnd\.stellarspend\.(v\d+)\+json/;
const MIGRATION_GUIDE_URL = '/docs/api-migration-v1';

function resolveVersionFromHeaders(request: NextRequest): string | null {
  const xApiVersion = request.headers.get('x-api-version');
  if (xApiVersion && xApiVersion.trim() !== '') {
    const normalised = /^\d+$/.test(xApiVersion.trim())
      ? `v${xApiVersion.trim()}`
      : xApiVersion.trim();
    return normalised;
  }

  const accept = request.headers.get('accept');
  if (accept) {
    const match = ACCEPT_HEADER_RE.exec(accept);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function addLegacyDeprecationHeaders(response: NextResponse, legacyPath: string): NextResponse {
  response.headers.set('Deprecation', '2025-01-01');
  response.headers.set('Sunset', '2026-01-01');
  response.headers.set(
    'Link',
    `</api/v1/${legacyPath.replace(/^\//, '')}>; rel="successor-version", <${MIGRATION_GUIDE_URL}>; rel="deprecation"`
  );
  return response;
}

export function authMiddleware(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  const versionedMatch = VERSIONED_PATH_RE.exec(pathname);
  if (versionedMatch) {
    const version = versionedMatch[1];
    if (!registry.isKnown(version)) {
      return NextResponse.json(
        { error: 'API version not supported' },
        { status: 404 }
      );
    }
    const response = NextResponse.next();
    response.headers.set('X-API-Version', version.replace(/^v/, ''));
    return response;
  }

  const unversionedMatch = UNVERSIONED_API_RE.exec(pathname);
  if (unversionedMatch) {
    const subpath = unversionedMatch[1] ?? '';
    const version = resolveVersionFromHeaders(request);
    if (version !== null) {
      if (!registry.isKnown(version)) {
        const supported = registry.getAll().map((e) => e.version);
        return NextResponse.json(
          { error: 'Unsupported API version', supported },
          { status: 400 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = `/api/${version}/${subpath}`;
      return NextResponse.rewrite(url);
    }

    const response = NextResponse.next();
    addLegacyDeprecationHeaders(response, subpath);
    return response;
  }

  return null;
}
