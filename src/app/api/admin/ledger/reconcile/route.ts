import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { reconcileAccount, getReconciliationByReport } from '@/lib/ledger';
import { verifyBalances } from '@/lib/ledger';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';

export async function POST(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  let body: { accountId?: string; reportId?: string; reportedBalance?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  if (!body.accountId || !body.reportId || body.reportedBalance === undefined) {
    return ErrorHandler.validation('accountId, reportId, and reportedBalance are required');
  }

  try {
    const { balance: ledgerBalance } = await verifyBalances(body.accountId);
    const result = await reconcileAccount(
      body.accountId,
      body.reportId,
      body.reportedBalance,
      ledgerBalance,
      body.notes,
    );
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const reportId = request.nextUrl.searchParams.get('reportId');
  if (!reportId) return ErrorHandler.validation('reportId query parameter is required');

  try {
    const results = await getReconciliationByReport(reportId);
    return NextResponse.json({ data: results });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
