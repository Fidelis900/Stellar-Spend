import { NextRequest, NextResponse } from "next/server";
import { addSecurityHeaders } from "./src/lib/security/headers";
import { authMiddleware } from "./src/lib/middleware/auth";
import { geoMiddleware, attachGeoHeaders } from "./src/lib/middleware/geo";
import { createLoggingMiddleware } from "./src/lib/middleware/logging";

export function middleware(request: NextRequest): NextResponse {
    const start = Date.now();
    const loggingMiddleware = createLoggingMiddleware();

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
            // 3. Pass through all other requests
            response = NextResponse.next();
        }
    }

    // 4. Attach geo headers
    response = attachGeoHeaders(response, request);

    // 5. Add security headers
    response = addSecurityHeaders(response);

    // 6. Log and add request ID
    const durationMs = Date.now() - start;
    response = loggingMiddleware(request, response, durationMs);

    return response;
}

export const config = {
    matcher: ["/api/:path*"],
};
