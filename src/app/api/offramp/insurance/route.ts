import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  calculateInsurancePremium,
  createInsurance,
  getInsuranceStatus,
  fileClaim,
  approveClaim,
  rejectClaim,
  processInsurancePayout,
  getInsuranceAnalytics,
} from '@/lib/services/insurance.service';
import { withIdempotency } from '@/lib/idempotency';

export async function GET(req: NextRequest) {
  try {
    const transactionId = req.nextUrl.searchParams.get('transactionId');
    const analytics = req.nextUrl.searchParams.get('analytics');

    if (analytics === 'true') {
      const data = await getInsuranceAnalytics();
      return NextResponse.json({ analytics: data });
    }

    if (!transactionId) {
      return ErrorHandler.validation('transactionId or analytics=true is required');
    }

    const result = await getInsuranceStatus(transactionId);
    return NextResponse.json({ insurance: (result as { rows: unknown[] }).rows[0] || null });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const { action, transactionId, insuranceId, amount, currency, includeInsurance, reason, evidence } = await req.json();

      if (action === 'claim') {
        if (!insuranceId || !reason) {
          return ErrorHandler.validation('Missing required fields: insuranceId, reason');
        }
        const result = await fileClaim(insuranceId, reason, evidence);
        return NextResponse.json({ success: true, claim: (result as { rows: unknown[] }).rows[0] });
      }

      if (!includeInsurance) {
        return NextResponse.json({ insurance: null });
      }

      if (!transactionId || !amount || !currency) {
        return ErrorHandler.validation('Missing required fields: transactionId, amount, currency');
      }

      const quote = await calculateInsurancePremium(parseFloat(amount), currency);
      const insurance = await createInsurance(transactionId, quote.premium, quote.coverage, quote.provider);

      return NextResponse.json({
        insurance: (insurance as { rows: unknown[] }).rows[0],
        quote,
      });
    } catch (error) {
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}

export async function PATCH(req: NextRequest) {
  try {
    const { action, insuranceId, rejectionReason } = await req.json();

    if (!action || !insuranceId) {
      return ErrorHandler.validation('Missing required fields: action, insuranceId');
    }

    if (action === 'approve') {
      const result = await approveClaim(insuranceId);
      return NextResponse.json({ success: true, insurance: (result as { rows: unknown[] }).rows[0] });
    }

    if (action === 'reject') {
      if (!rejectionReason) {
        return ErrorHandler.validation('rejectionReason is required to reject a claim');
      }
      const result = await rejectClaim(insuranceId, rejectionReason);
      return NextResponse.json({ success: true, insurance: (result as { rows: unknown[] }).rows[0] });
    }

    if (action === 'payout') {
      const result = await processInsurancePayout(insuranceId);
      return NextResponse.json({ success: true, insurance: (result as { rows: unknown[] }).rows[0] });
    }

    return ErrorHandler.validation('action must be "approve", "reject", or "payout"');
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
