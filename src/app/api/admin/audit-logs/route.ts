import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const actionType = searchParams.get("actionType") || undefined;
    const resourceType = searchParams.get("resourceType") || undefined;
    const status = (searchParams.get("status") as "success" | "failure") || undefined;
    const startDate = searchParams.get("startDate") ? Number(searchParams.get("startDate")) : undefined;
    const endDate = searchParams.get("endDate") ? Number(searchParams.get("endDate")) : undefined;
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 1000);
    const offset = Number(searchParams.get("offset")) || 0;

    const logs = await auditLoggingService.getAuditLogs(
      { actionType, resourceType, status, startDate, endDate },
      limit,
      offset,
    );

    return NextResponse.json({ logs, count: logs.length });
  } catch (error) {
    logger.error("Failed to fetch audit logs", { error });
    return ErrorHandler.serverError(error);
  }
}
