import { NextRequest, NextResponse } from "next/server";
import { addSecurityHeaders } from "./src/lib/security/headers";
import { authMiddleware } from "./src/lib/middleware/auth";
import { geoMiddleware, attachGeoHeaders } from "./src/lib/middleware/geo";
import { createLoggingMiddleware } from "./src/lib/middleware/logging";

export function middleware(request: NextRequest): NextResponse {
    const start = Date.now();
    const loggingMiddleware = createLoggingMiddleware();

    // Resolve the correlation ID once, up front, so the value logged here is
    // the exact same value route handlers see via request.headers.get('x-request-id').
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);

    let response: NextResponse;

    // 1. Check geo restrictions first
    const geoResponse = geoMiddleware(request);
    if (geoResponse) {
        response = geoResponse;
    } else {
        // 2. Check auth/versioning
        const authResponse = authMiddleware(request);
        if (authResponse) {
            response = authResponse;
        } else {
            // 3. Pass through all other requests, forwarding the resolved
            // request ID so the route handler can correlate its own logs.
            response = NextResponse.next({ request: { headers: requestHeaders } });
        }
    }

    // 4. Attach geo headers
    response = attachGeoHeaders(response, request);

    // 5. Add security headers
    response = addSecurityHeaders(response);

    // 6. Log and add request ID
    const durationMs = Date.now() - start;
    response = loggingMiddleware(request, response, durationMs, requestId);

    return response;
}

export const config = {
    matcher: ["/api/:path*"],
};
