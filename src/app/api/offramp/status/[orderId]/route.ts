import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { get, set, isFresh } from '@/lib/polling/status-cache';
import { ErrorHandler } from '@/lib/error-handler';

export const maxDuration = 10;

const PAYCREST_BASE_URL = 'https://api.paycrest.io/v1';

const PAYOUT_TERMINAL_STATES = ['validated', 'settled', 'refunded', 'expired'];

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  // Check cache first
  const cached = get(orderId);
  if (cached && isFresh(cached)) {
    return NextResponse.json({
      status: cached.status,
      id: orderId,
      cachedAt: cached.cachedAt,
    });
  }

  try {
    const res = await fetch(`${PAYCREST_BASE_URL}/sender/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${env.server.PAYCREST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errorMessage = body.message ?? 'Failed to fetch order status';

      // Return stale cache entry with upstreamError if available
      if (cached) {
        return NextResponse.json({
          status: cached.status,
          id: orderId,
          cachedAt: cached.cachedAt,
          upstreamError: errorMessage,
        });
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: res.status }
      );
    }

    const data = await res.json();
    const status: string = data.status;
    const isTerminal = PAYOUT_TERMINAL_STATES.includes(status);

    // Populate cache
    set(orderId, {
      status,
      raw: data,
      cachedAt: Date.now(),
      isTerminal,
    });

    return NextResponse.json({ status, id: orderId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';

    // Return stale cache entry with upstreamError if available
    if (cached) {
      return NextResponse.json({
        status: cached.status,
        id: orderId,
        cachedAt: cached.cachedAt,
        upstreamError: message,
      });
    }

    return ErrorHandler.serverError(err);
  }
}
