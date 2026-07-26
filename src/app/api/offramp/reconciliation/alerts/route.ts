import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  generateReconciliationReport,
  generateAlerts,
  buildDailySettlementReport,
  type ReconciliationRecord,
} from '@/lib/reconciliation';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records, includeDaily } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return ErrorHandler.validation('records array is required and must not be empty');
    }

    const report = await generateReconciliationReport(records as ReconciliationRecord[]);
    const alerts = generateAlerts(report);

    const response: Record<string, unknown> = {
      alerts,
      summary: report.summary,
      timestamp: report.timestamp,
      date: report.date,
    };

    if (includeDaily) {
      const daily = await buildDailySettlementReport(records as ReconciliationRecord[]);
      response.daily = daily;
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Alert generation error:', {}, error);
    return ErrorHandler.serverError(error);
  }
}
