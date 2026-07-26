import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get("format") as "json" | "csv") || "json";
    const startDate = searchParams.get("startDate") ? Number(searchParams.get("startDate")) : undefined;
    const endDate = searchParams.get("endDate") ? Number(searchParams.get("endDate")) : undefined;
    const actionType = searchParams.get("actionType") || undefined;

    const export_ = await auditLoggingService.exportAuditLogs(format, {
      startDate,
      endDate,
      actionType,
    });

    const headers = new Headers();
    if (format === "csv") {
      headers.set("Content-Type", "text/csv");
      headers.set("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.csv"`);
    } else {
      headers.set("Content-Type", "application/json");
      headers.set("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.json"`);
    }

    return new NextResponse(export_.data, { headers });
  } catch (error) {
    logger.error("Failed to export audit logs", { error });
    return ErrorHandler.serverError(error);
  }
}
