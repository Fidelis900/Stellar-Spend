import { NextResponse } from 'next/server';
import { performHealthCheck } from '@/lib/health-check';
import { checkDatabaseHealth } from '@/lib/health-check';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/readiness
 *
 * Readiness probe — answers "is this process ready to serve traffic?"
 * Verifies that all critical external dependencies (DB, Stellar/Soroban RPC)
 * are reachable before accepting traffic.
 *
 * HTTP 200 → ready (all critical deps healthy)
 * HTTP 503 → not ready (one or more critical deps down/degraded)
 *
 * Kubernetes / load-balancers use this to decide whether to route traffic.
 */
export async function GET() {
  const [healthResult, dbResult] = await Promise.all([
    performHealthCheck(),
    checkDatabaseHealth(),
  ]);

  const isReady =
    dbResult.status !== 'unhealthy' &&
    healthResult.dependencies.stellar.status !== 'unhealthy';

  const status = isReady ? 200 : 503;

  return NextResponse.json(
    {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbResult,
        stellar: healthResult.dependencies.stellar,
        paycrest: healthResult.dependencies.paycrest,
        allbridge: healthResult.dependencies.allbridge,
      },
    },
    { status },
  );
}
