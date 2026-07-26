import { NextRequest, NextResponse } from "next/server";
import { transactionSigningService } from "@/lib/transaction-signing";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signatureId } = body;

    if (!signatureId) {
      return ErrorHandler.validation("signatureId is required");
    }

    const isValid = await transactionSigningService.verifySignature(signatureId);
    const signature = await transactionSigningService.getSignatureStatus(signatureId);

    return NextResponse.json({
      signatureId,
      isValid,
      signature,
    });
  } catch (error) {
    logger.error("Failed to verify signature", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to verify signature"));
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const signatureId = searchParams.get("signatureId");

    if (!signatureId) {
      return ErrorHandler.validation("signatureId query parameter required");
    }

    const signature = await transactionSigningService.getSignatureStatus(signatureId);
    const logs = await transactionSigningService.getVerificationLogs(signatureId);

    if (!signature) {
      return ErrorHandler.notFound("Signature");
    }

    return NextResponse.json({
      signature,
      verificationLogs: logs,
    });
  } catch (error) {
    logger.error("Failed to fetch signature status", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch signature status"));
  }
}
