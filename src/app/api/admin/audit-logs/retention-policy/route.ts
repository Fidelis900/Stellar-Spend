import { NextRequest, NextResponse } from "next/server";
import { auditLoggingService } from "@/lib/audit-logging";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    const policy = await auditLoggingService.getRetentionPolicy();
    return NextResponse.json({ retentionDays: policy });
  } catch (error) {
    logger.error("Failed to fetch retention policy", { error });
    return ErrorHandler.serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { retentionDays } = body;

    if (!retentionDays || retentionDays < 1) {
      return ErrorHandler.validation("Invalid retention days");
    }

    await auditLoggingService.setRetentionPolicy(retentionDays);
    return NextResponse.json({ success: true, retentionDays });
  } catch (error) {
    logger.error("Failed to set retention policy", { error });
    return ErrorHandler.serverError(error);
  }
}
