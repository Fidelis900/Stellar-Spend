import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get("actionType") || undefined;
    const resourceType = searchParams.get("resourceType") || undefined;
    const status = (searchParams.get("status") as "success" | "failure") || undefined;
    const startDate = searchParams.get("startDate")
      ? parseInt(searchParams.get("startDate")!, 10)
      : undefined;
    const endDate = searchParams.get("endDate")
      ? parseInt(searchParams.get("endDate")!, 10)
      : undefined;
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const logs = await auditLoggingService.getAuditLogs(
      {
        actionType,
        resourceType,
        status,
        startDate,
        endDate,
      },
      limit,
      offset,
    );

    return NextResponse.json({ logs });
  } catch (error) {
    logger.error("Failed to fetch audit logs", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch audit logs"));
  }
}
