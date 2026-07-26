import { NextRequest, NextResponse } from "next/server";
import { transactionSigningService } from "@/lib/transaction-signing";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, userAddress, signature, publicKey, algorithm } = body;

    if (!transactionId || !userAddress || !signature || !publicKey) {
      return ErrorHandler.validation("transactionId, userAddress, signature, and publicKey are required");
    }

    const txSignature = await transactionSigningService.signTransaction(
      transactionId,
      userAddress,
      signature,
      publicKey,
      algorithm || "ed25519",
    );

    return NextResponse.json(txSignature, { status: 201 });
  } catch (error) {
    logger.error("Failed to sign transaction", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to sign transaction"));
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get("transactionId");

    if (!transactionId) {
      return ErrorHandler.validation("transactionId query parameter required");
    }

    const signatures = await transactionSigningService.getTransactionSignatures(
      transactionId,
    );

    return NextResponse.json({ signatures });
  } catch (error) {
    logger.error("Failed to fetch signatures", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch signatures"));
  }
}
