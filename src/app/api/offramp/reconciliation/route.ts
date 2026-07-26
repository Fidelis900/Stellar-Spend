import { NextResponse, type NextRequest } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  generateReconciliationReport,
  buildSettlementCsv,
  buildDailySettlementReport,
  type ReconciliationRecord,
} from '@/lib/reconciliation';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records, format } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return ErrorHandler.validation('records array is required and must not be empty');
    }

    for (const record of records) {
      if (!record.transactionId) {
        return ErrorHandler.validation('Each record must have a transactionId');
      }
    }

    if (format === 'csv') {
      const report = await generateReconciliationReport(records as ReconciliationRecord[]);
      const csv = buildSettlementCsv(report);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="reconciliation-${report.date}.csv"`,
        },
      });
    }

    if (format === 'daily') {
      const daily = await buildDailySettlementReport(records as ReconciliationRecord[]);
      return NextResponse.json(daily);
    }

    const report = await generateReconciliationReport(records as ReconciliationRecord[]);
    return NextResponse.json(report);
  } catch (error) {
    logger.error('reconciliation.error', {}, error);
    return ErrorHandler.serverError(error);
  }
}
