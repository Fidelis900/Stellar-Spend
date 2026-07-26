import { NextRequest, NextResponse } from 'next/server';
import { scanStalledTransactions, getTimeoutMetrics } from '@/lib/transaction-timeout';
import { dal } from '@/lib/db/dal';
import { logger } from '@/lib/logger';
import { runReconciliationJob } from '@/lib/reconciliation';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return ErrorHandler.unauthorized('Unauthorized');
    }

    logger.info('cron.scan-stalls.start', {});

    const transactions = await dal.getByUser('*').catch(() => []);
    const allTransactions = transactions.length > 0
      ? transactions
      : [];

    const stallResults = await scanStalledTransactions(allTransactions);

    const autoRetried = stallResults.filter((r) => r.autoRetried);
    const flaggedManual = stallResults.filter((r) => r.flaggedManual);

    logger.info('cron.scan-stalls.complete', {
      totalChecked: stallResults.length,
      autoRetried: autoRetried.length,
      flaggedManual: flaggedManual.length,
    });

    return NextResponse.json({
      ok: true,
      checked: stallResults.length,
      autoRetried: autoRetried.length,
      flaggedManual: flaggedManual.length,
      results: stallResults,
      metrics: getTimeoutMetrics(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('cron.scan-stalls.failed', {}, err);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Stall scan failed'));
  }
}
