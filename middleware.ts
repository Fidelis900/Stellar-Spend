import { NextRequest, NextResponse } from "next/server";
import { registry } from "./src/lib/api-versioning/registry";
import { recordApiTiming } from "./src/lib/performance";
import { logger } from "./src/lib/logger";
import { addSecurityHeaders } from "./src/lib/security/headers";
import { resolveGeo } from "./src/lib/geo/geoip";
import { isRestrictedJurisdiction } from "./src/lib/kyc-limits";

// Matches /api/v{n}/... and captures the version segment
const VERSIONED_PATH_RE = /^\/api\/(v\d+)(\/.*)?$/;

// Matches /api/{non-version-segment}/... (unversioned legacy paths)
const UNVERSIONED_API_RE = /^\/api\/(?!v\d+(?:\/|$))(.*)$/;

// Matches application/vnd.stellarspend.v{n}+json
const ACCEPT_HEADER_RE = /application\/vnd\.stellarspend\.(v\d+)\+json/;

// Migration guide URL referenced in deprecation headers
const MIGRATION_GUIDE_URL = "/docs/api-migration-v1";

// Money-movement endpoints that compliance gating applies to. Webhooks, auth,
// health, and read-only endpoints are intentionally excluded — gating those
// by the caller's IP would break inbound provider webhooks and monitoring.
const GATED_PATH_RE = /^\/api\/(v\d+\/)?(transactions|onramp|offramp)(\/|$)/;

function resolveVersionFromHeaders(request: NextRequest): string | null {
    // X-API-Version header takes precedence over Accept header
    const xApiVersion = request.headers.get("x-api-version");
    if (xApiVersion && xApiVersion.trim() !== "") {
        const normalised = /^\d+$/.test(xApiVersion.trim())
            ? `v${xApiVersion.trim()}`
            : xApiVersion.trim();
        return normalised;
    }

    // Accept header
    const accept = request.headers.get("accept");
    if (accept) {
        const match = ACCEPT_HEADER_RE.exec(accept);
        if (match) {
            return match[1];
        }
    }

    return null;
}

function addLegacyDeprecationHeaders(response: NextResponse, legacyPath: string): NextResponse {
    // v1 is currently supported, so legacy routes are deprecated (pointing to v1 successor)
    // Use a fixed deprecation date — when v1 was introduced
    response.headers.set("Deprecation", "2025-01-01");
    response.headers.set("Sunset", "2026-01-01");
    response.headers.set(
        "Link",
        `</api/v1/${legacyPath.replace(/^\//, "")}>; rel="successor-version", <${MIGRATION_GUIDE_URL}>; rel="deprecation"`
    );
    return response;
}

export function middleware(request: NextRequest): NextResponse {
    const start = Date.now();
    const { pathname } = request.nextUrl;

    function respond(response: NextResponse): NextResponse {
        const durationMs = Date.now() - start;
        recordApiTiming({
            route: pathname.replace(/\/[0-9a-f-]{8,}/gi, '/:id'), // normalise IDs
            method: request.method,
            durationMs,
            statusCode: response.status,
            timestamp: start,
        });
        const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
        const log = logger.withContext({ requestId });
        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';
        log[level]('http.request', { method: request.method, path: pathname, status: response.status, durationMs });
        response.headers.set('X-Request-Id', requestId);
        if (geo.country) {
            response.headers.set('X-Geo-Country', geo.country);
        }
        return addSecurityHeaders(response);
    }

    // 0. Resolve geo (cached, override-able) and gate restricted jurisdictions
    // on money-movement endpoints.
    const geo = resolveGeo(request);
    if (geo.country && !geo.overridden && isRestrictedJurisdiction(geo.country) && GATED_PATH_RE.test(pathname)) {
        return respond(NextResponse.json(
            {
                error: "Service unavailable in your region",
                country: geo.country,
            },
            { status: 451 }
        ));
    }

    // 1. Check for versioned URL path: /api/v{n}/*
    const versionedMatch = VERSIONED_PATH_RE.exec(pathname);
    if (versionedMatch) {
        const version = versionedMatch[1];
        if (!registry.isKnown(version)) {
            return respond(NextResponse.json(
                { error: "API version not supported" },
                { status: 404 }
            ));
        }
        // Known version — pass through, add X-API-Version header
        const response = NextResponse.next();
        response.headers.set("X-API-Version", version.replace(/^v/, ""));
        return respond(response);
    }

    // 2. Check for unversioned /api/* paths with version headers
    const unversionedMatch = UNVERSIONED_API_RE.exec(pathname);
    if (unversionedMatch) {
        const subpath = unversionedMatch[1] ?? "";
        const version = resolveVersionFromHeaders(request);
        if (version !== null) {
            if (!registry.isKnown(version)) {
                const supported = registry.getAll().map((e) => e.version);
                return respond(NextResponse.json(
                    { error: "Unsupported API version", supported },
                    { status: 400 }
                ));
            }
            // Rewrite URL to versioned equivalent
            const url = request.nextUrl.clone();
            url.pathname = `/api/${version}/${subpath}`;
            return respond(NextResponse.rewrite(url));
        }

        // Legacy route with no version headers — add deprecation headers
        const response = NextResponse.next();
        addLegacyDeprecationHeaders(response, subpath);
        return respond(response);
    }

    // 3. Pass through all other requests unchanged
    return respond(NextResponse.next());
}

export const config = {
    matcher: ["/api/:path*"],
};
