import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(request: NextRequest) {
  try {
    const retentionDays = await auditLoggingService.getRetentionPolicy();
    return NextResponse.json({ retentionDays });
  } catch (error) {
    logger.error("Failed to fetch retention policy", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch retention policy"));
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminAddress = request.headers.get("x-admin-address");
    if (!adminAddress) {
      return ErrorHandler.validation("Admin address required");
    }

    const body = await request.json();
    const { retentionDays } = body;

    if (!retentionDays || retentionDays < 1) {
      return ErrorHandler.validation("retentionDays must be at least 1");
    }

    await auditLoggingService.setRetentionPolicy(retentionDays);

    // Log the admin action
    await auditLoggingService.logAdminAction(adminAddress, "UPDATE_RETENTION_POLICY", {
      actionDetails: `Retention policy updated to ${retentionDays} days`,
    });

    return NextResponse.json({ success: true, retentionDays });
  } catch (error) {
    logger.error("Failed to update retention policy", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to update retention policy"));
  }
}
