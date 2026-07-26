import { NextRequest, NextResponse } from "next/server";
import { sessionManagementService } from "@/lib/session-management";
import { logger } from "@/lib/logger";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const clientIP = getClientIP(request);
    const userAgent = request.headers.get("user-agent") || undefined;

    const session = await sessionManagementService.createSession(
      userAddress,
      clientIP,
      userAgent,
    );

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    logger.error("Failed to create session", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to create session"));
  }
}

export async function GET(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const sessions = await sessionManagementService.getUserSessions(userAddress);
    return NextResponse.json({ sessions });
  } catch (error) {
    logger.error("Failed to fetch sessions", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch sessions"));
  }
}
