import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminAddress = searchParams.get("adminAddress") || undefined;
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 1000);
    const offset = Number(searchParams.get("offset")) || 0;

    const actions = await auditLoggingService.getAdminActions(adminAddress, limit, offset);

    return NextResponse.json({ actions, count: actions.length });
  } catch (error) {
    logger.error("Failed to fetch admin actions", { error });
    return ErrorHandler.serverError(error);
  }
}
