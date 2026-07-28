import { NextRequest, NextResponse } from 'next/server';
import { validateRequestSignature, ReplayAttackPrevention } from '@/lib/request-signing';
import { logger } from '@/lib/logger';

// Global replay attack prevention instance
const replayPrevention = new ReplayAttackPrevention();

/**
 * Request signature verification middleware
 * Validates HMAC signatures and prevents replay attacks
 */
export async function requestSigningMiddleware(
  request: NextRequest,
  secret: string,
  skipPaths: string[] = [],
): Promise<NextResponse | null> {
  try {
    const path = new URL(request.url).pathname;

    // Skip signature verification for certain paths
    if (skipPaths.some((skipPath) => path.startsWith(skipPath))) {
      return null;
    }

    // Get request body for signature verification
    let body: string | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.text();
      } catch {
        // Body might not be readable
        body = null;
      }
    }

    // Convert headers to plain object
    const headers: Record<string, string | string[] | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Validate signature
    const { valid, error } = validateRequestSignature(request.method, path, body, headers, secret);

    if (!valid) {
      logger.warn('Invalid request signature', {
        path,
        method: request.method,
        error,
      });

      return new NextResponse(
        JSON.stringify({
          error: 'Invalid signature',
          message: error || 'Request signature verification failed',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Check for replay attacks
    const timestamp = headers['x-timestamp'] as string | undefined;
    if (timestamp && replayPrevention.isReplay(timestamp)) {
      logger.warn('Replay attack detected', {
        path,
        method: request.method,
        timestamp,
      });

      return new NextResponse(
        JSON.stringify({
          error: 'Replay attack detected',
          message: 'This request has already been processed',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Record timestamp for replay prevention
    if (timestamp) {
      replayPrevention.recordTimestamp(timestamp);
    }

    // Request is valid, return null to continue processing
    return null;
  } catch (error) {
    logger.error('Request signing middleware error', { error });
    // On error, reject the request for security
    return new NextResponse(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to verify request signature',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

/**
 * Cleanup replay prevention on shutdown
 */
export function cleanupRequestSigning(): void {
  replayPrevention.destroy();
}
