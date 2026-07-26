import { NextRequest, NextResponse } from 'next/server';
import { runReconciliationJob, getReconciliationHistory } from '@/lib/reconciliation';
import { dal } from '@/lib/db/dal';
import { logger } from '@/lib/logger';
import type { ReconciliationRecord } from '@/lib/reconciliation';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

async function fetchDailyRecords(): Promise<ReconciliationRecord[]> {
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  try {
    const transactions = await dal.getByUser('*').catch(() => []);
    return transactions
      .filter((tx: any) => tx.timestamp >= yesterday)
      .map((tx: any) => ({
        transactionId: tx.id,
        stellarTxHash: tx.stellarTxHash,
        baseTxHash: tx.baseTxHash,
        paycrestOrderId: tx.payoutOrderId,
        amount: tx.amount,
        currency: tx.currency,
        timestamp: new Date(tx.timestamp).toISOString(),
      }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return ErrorHandler.unauthorized('Unauthorized');
    }

    logger.info('cron.daily-reconciliation.start', {});

    const records = await fetchDailyRecords();
    const entry = await runReconciliationJob(records);
    const history = await getReconciliationHistory();

    logger.info('cron.daily-reconciliation.complete', {
      runId: entry.id,
      totalTransactions: entry.report.totalTransactions,
      discrepancies: entry.report.discrepancies.length,
    });

    return NextResponse.json({
      ok: true,
      totalTransactions: entry.report.totalTransactions,
      matchedTransactions: entry.report.matchedTransactions,
      discrepancies: entry.report.discrepancies.length,
      alerts: entry.alerts.length,
      summary: entry.report.summary,
      runId: entry.id,
      timestamp: entry.runAt,
      history: history.slice(0, 5),
    });
  } catch (err) {
    logger.error('cron.daily-reconciliation.failed', {}, err);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Daily reconciliation failed'));
  }
}
