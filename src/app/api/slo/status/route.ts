import { NextResponse } from 'next/server';
import { performanceMonitor } from '@/lib/performance-monitoring';

export const dynamic = 'force-dynamic';

/** Exposes the SLO dashboard so deploy automation (e.g. canary promotion) can gate on it. */
export async function GET() {
  return NextResponse.json(performanceMonitor.getDashboardData());
}
