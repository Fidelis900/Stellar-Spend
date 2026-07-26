import { NextResponse } from 'next/server';
import { cache } from '@/lib/cache';
import { ErrorHandler } from '@/lib/error-handler';

/**
 * GET /api/monitoring/cache
 * 
 * Expose cache hit/miss metrics for observability dashboard
 */
export async function GET() {
  try {
    const metrics = cache.getMetrics();
    const health = await cache.healthCheck();

    return NextResponse.json({
      status: health ? 'healthy' : 'degraded',
      metrics: {
        hits: metrics.hits,
        misses: metrics.misses,
        sets: metrics.sets,
        errors: metrics.errors,
        hitRate: metrics.hitRate,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cache Metrics] Error:', error);
    return ErrorHandler.serverError(error);
  }
}

/**
 * POST /api/monitoring/cache
 * 
 * Warm cache manually (admin operation)
 */
export async function POST() {
  try {
    const { warmAllCaches } = await import('@/lib/cache/warming');
    await warmAllCaches();

    return NextResponse.json({
      success: true,
      message: 'Cache warming initiated',
    });
  } catch (error) {
    console.error('[Cache Warming] Error:', error);
    return ErrorHandler.serverError(error);
  }
}

/**
 * DELETE /api/monitoring/cache
 * 
 * Clear cache (admin operation)
 */
export async function DELETE() {
  try {
    await cache.clear();
    cache.resetMetrics();

    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    console.error('[Cache Clear] Error:', error);
    return ErrorHandler.serverError(error);
  }
}
