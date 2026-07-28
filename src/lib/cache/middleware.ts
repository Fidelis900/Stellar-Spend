import { NextRequest, NextResponse } from 'next/server';
import { getCacheClient } from './client';

export interface CacheOptions {
  ttl: number; // TTL in seconds
  key: string;
  staleWhileRevalidate?: number; // SWR in seconds
}

/**
 * Cache middleware for API routes.
 * Implements cache-control headers and stale-while-revalidate pattern.
 */
export async function withCaching(
  options: CacheOptions,
  handler: (req: NextRequest) => Promise<Response>,
): Promise<Response> {
  const client = getCacheClient();
  const cached = await client.get(options.key);

  if (cached) {
    const response = new NextResponse(cached, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${options.ttl}, stale-while-revalidate=${options.staleWhileRevalidate || options.ttl}`,
        'X-Cache': 'HIT',
      },
    });
    return response;
  }

  // Fetch fresh data
  const response = await handler(new NextRequest(new URL('http://localhost')));
  const contentType = response.headers.get('content-type');

  if (response.ok && contentType?.includes('application/json')) {
    const body = await response.text();
    await client.set(options.key, body, options.ttl);

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${options.ttl}, stale-while-revalidate=${options.staleWhileRevalidate || options.ttl}`,
        'X-Cache': 'MISS',
      },
    });
  }

  return response;
}

/**
 * Set cache-control headers for a response.
 */
export function setCacheHeaders(
  response: NextResponse,
  ttl: number,
  staleWhileRevalidate?: number,
): NextResponse {
  response.headers.set(
    'Cache-Control',
    `public, max-age=${ttl}, stale-while-revalidate=${staleWhileRevalidate || ttl}`,
  );
  return response;
}

/**
 * Invalidate cache by pattern.
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  const client = getCacheClient();
  await client.flushPattern(pattern);
}
