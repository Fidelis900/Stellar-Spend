import { NextRequest, NextResponse } from 'next/server';
import { KYCLimitService } from '@/lib/kyc-limits';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

// GET: KYC status, AML result, reminders, or compliance report
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'compliance-report') {
      const from = parseInt(req.nextUrl.searchParams.get('from') || '0');
      const to = parseInt(req.nextUrl.searchParams.get('to') || String(Date.now()));
      const report = KYCLimitService.generateComplianceReport(from, to);
      return NextResponse.json({ report });
    }

    if (!userId) {
      return ErrorHandler.validation('userId is required');
    }

    if (action === 'aml') {
      const result = KYCLimitService.getAMLResult(userId);
      return NextResponse.json({ aml: result });
    }

    if (action === 'reminders') {
      const reminders = KYCLimitService.getKYCRenewalReminders(userId);
      return NextResponse.json({ reminders });
    }

    if (action === 'limits') {
      const limits = KYCLimitService.getUserLimits(userId);
      return NextResponse.json({ limits });
    }

    const kyc = KYCLimitService.getKYC(userId);
    return NextResponse.json({ kyc });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

// POST: submit KYC, upload document, run AML screening
export async function POST(req: NextRequest) {
  try {
    const { action, userId, documentType, documentId, fileName, mimeType, transactionAmount } = await req.json();

    if (!userId) {
      return ErrorHandler.validation('userId is required');
    }

    if (action === 'upload-document') {
      if (!documentType || !documentId) {
        return ErrorHandler.validation('documentType and documentId are required');
      }
      const upload = KYCLimitService.uploadDocument(userId, documentType, documentId, fileName, mimeType);
      return NextResponse.json({ success: true, upload, kyc: KYCLimitService.getKYC(userId) });
    }

    if (action === 'aml-screen') {
      const result = KYCLimitService.screenAML(userId, transactionAmount);
      return NextResponse.json({ success: true, aml: result });
    }

    if (action === 'submit') {
      if (!documentType || !documentId) {
        return ErrorHandler.validation('documentType and documentId are required');
      }
      const kyc = KYCLimitService.submitKYC(userId, documentType, documentId);
      return NextResponse.json({ success: true, kyc });
    }

    return ErrorHandler.validation('action must be "submit", "upload-document", or "aml-screen"');
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

// PATCH: verify/reject KYC, approve/reject limit increase
export async function PATCH(req: NextRequest) {
  try {
    const { action, userId, reason, requestedTier, requestId } = await req.json();

    if (!userId || !action) {
      return ErrorHandler.validation('userId and action are required');
    }

    if (action === 'verify') {
      const kyc = KYCLimitService.verifyKYC(userId);
      if (!kyc) return ErrorHandler.notFound('KYC submission');
      return NextResponse.json({ success: true, kyc });
    }

    if (action === 'reject') {
      if (!reason) return ErrorHandler.validation('reason is required to reject KYC');
      const kyc = KYCLimitService.rejectKYC(userId, reason);
      if (!kyc) return ErrorHandler.notFound('KYC submission');
      return NextResponse.json({ success: true, kyc });
    }

    if (action === 'request-limit-increase') {
      if (!requestedTier) return ErrorHandler.validation('requestedTier is required');
      const request = KYCLimitService.requestLimitIncrease(userId, requestedTier);
      return NextResponse.json({ success: true, request });
    }

    if (action === 'approve-limit-increase') {
      if (!requestId) return ErrorHandler.validation('requestId is required');
      const approved = KYCLimitService.approveLimitIncrease(userId, requestId);
      if (!approved) return ErrorHandler.handle(new ApiError(ErrorType.NOT_FOUND, 'Request not found or already processed'));
      return NextResponse.json({ success: true, limits: KYCLimitService.getUserLimits(userId) });
    }

    return ErrorHandler.validation('Unknown action');
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
