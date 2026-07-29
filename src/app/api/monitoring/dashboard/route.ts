import { NextResponse } from 'next/server';
import { getDashboardMetrics, recordUptimeCheck } from '@/lib/monitoring';
import { getTransactionQueue } from '@/lib/priority-queue';
import { getTransactionAnalytics } from '@/lib/transaction-analytics';
import { getApiMetrics, getDbMetrics, getVitalsMetrics, getPerfAlerts } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Ping the health endpoint and record uptime
  const start = Date.now();
  let healthOk = false;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/api/health`,
      { signal: AbortSignal.timeout(5000) },
    );
    healthOk = res.ok;
  } catch {
    healthOk = false;
  }
  recordUptimeCheck(healthOk, Date.now() - start);

  const [monitoring, queueMetrics, transactionAnalytics] = await Promise.all([
    Promise.resolve(getDashboardMetrics()),
    Promise.resolve(getTransactionQueue().getMetrics()),
    getTransactionAnalytics(),
  ]);

  return NextResponse.json({
    ok: true,
    monitoring,
    queue: queueMetrics,
    transactions: transactionAnalytics,
    performance: {
      api: getApiMetrics(),
      db: getDbMetrics(),
      vitals: getVitalsMetrics(),
      alerts: getPerfAlerts(),
    },
  });
}
