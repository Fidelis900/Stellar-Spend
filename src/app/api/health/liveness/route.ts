import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/liveness
 *
 * Liveness probe — answers "is this process alive?"
 * This should ONLY fail if the Node process itself is in a broken/deadlocked
 * state.  It must NOT check external dependencies, because a failing external
 * service should NOT cause the container to restart (that's readiness's job).
 *
 * Kubernetes / load-balancers use this endpoint to decide whether to restart
 * the container.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
