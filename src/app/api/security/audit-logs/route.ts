import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!userAddress) {
      return ErrorHandler.validation("userAddress query parameter required");
    }

    const logs = await auditLoggingService.getUserAuditLogs(userAddress, limit, offset);
    return NextResponse.json({ logs });
  } catch (error) {
    logger.error("Failed to fetch audit logs", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch audit logs"));
  }
}
