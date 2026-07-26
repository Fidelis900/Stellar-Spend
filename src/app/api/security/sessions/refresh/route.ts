import { NextRequest, NextResponse } from "next/server";
import { sessionManagementService } from "@/lib/session-management";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return ErrorHandler.validation("Refresh token required");
    }

    const session = await sessionManagementService.refreshSession(refreshToken);

    if (!session) {
      return ErrorHandler.unauthorized("Invalid or expired refresh token");
    }

    return NextResponse.json(session);
  } catch (error) {
    logger.error("Failed to refresh session", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to refresh session"));
  }
}
