import { registry } from './registry';

export interface NegotiationResult {
  version: string | null;
  source: 'url' | 'x-api-version-header' | 'accept-header' | 'legacy-default';
  error?: 'unsupported' | 'unrecognised-prefix';
}

export interface VersionNegotiator {
  resolve(request: Request): NegotiationResult;
}

// Matches /api/v{n}/... and captures the version segment
const VERSION_PATH_RE = /^\/api\/(v\d+)(\/|$)/;

// Matches application/vnd.stellarspend.v{n}+json
const ACCEPT_HEADER_RE = /application\/vnd\.stellarspend\.(v\d+)\+json/;

function resolveFromUrl(pathname: string): NegotiationResult | null {
  const match = VERSION_PATH_RE.exec(pathname);
  if (!match) return null;

  const version = match[1];
  if (!registry.isKnown(version)) {
    return { version: null, source: 'url', error: 'unrecognised-prefix' };
  }
  return { version, source: 'url' };
}

function resolveFromXApiVersionHeader(headerValue: string | null): NegotiationResult | null {
  if (!headerValue || headerValue.trim() === '') return null;

  // Normalise: accept bare numbers like "1" as well as "v1"
  const normalised = /^\d+$/.test(headerValue.trim())
    ? `v${headerValue.trim()}`
    : headerValue.trim();

  if (!registry.isKnown(normalised)) {
    return {
      version: null,
      source: 'x-api-version-header',
      error: 'unsupported',
    };
  }
  return { version: normalised, source: 'x-api-version-header' };
}

function resolveFromAcceptHeader(headerValue: string | null): NegotiationResult | null {
  if (!headerValue) return null;

  const match = ACCEPT_HEADER_RE.exec(headerValue);
  if (!match) return null;

  const version = match[1];
  if (!registry.isKnown(version)) {
    return { version: null, source: 'accept-header', error: 'unsupported' };
  }
  return { version, source: 'accept-header' };
}

export const negotiator: VersionNegotiator = {
  resolve(request: Request): NegotiationResult {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. URL path takes highest precedence
    const fromUrl = resolveFromUrl(pathname);
    if (fromUrl !== null) return fromUrl;

    // 2. X-API-Version header
    const xApiVersion = request.headers.get('x-api-version');
    const fromHeader = resolveFromXApiVersionHeader(xApiVersion);
    if (fromHeader !== null) return fromHeader;

    // 3. Accept header
    const accept = request.headers.get('accept');
    const fromAccept = resolveFromAcceptHeader(accept);
    if (fromAccept !== null) return fromAccept;

    // 4. Legacy default — fall back to v1
    return { version: 'v1', source: 'legacy-default' };
  },
};
