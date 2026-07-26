import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(request: NextRequest) {
  try {
    const adminAddress = request.headers.get("x-admin-address");
    if (!adminAddress) {
      return ErrorHandler.validation("Admin address required");
    }

    const body = await request.json();
    const { retentionDays } = body;

    const deletedCount = await auditLoggingService.cleanupOldLogs(
      retentionDays || undefined,
    );

    // Log the admin action
    await auditLoggingService.logAdminAction(adminAddress, "CLEANUP_AUDIT_LOGS", {
      actionDetails: `Cleaned up ${deletedCount} old audit logs`,
    });

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    logger.error("Failed to cleanup audit logs", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to cleanup audit logs"));
  }
}
