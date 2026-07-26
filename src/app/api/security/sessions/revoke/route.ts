import { NextRequest, NextResponse } from "next/server";
import { sessionManagementService } from "@/lib/session-management";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

export async function POST(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const body = await request.json();
    const { sessionId, revokeAll, reason } = body;

    if (revokeAll) {
      await sessionManagementService.revokeAllUserSessions(userAddress, reason);
      return NextResponse.json({ success: true, message: "All sessions revoked" });
    }

    if (!sessionId) {
      return ErrorHandler.validation("Session ID or revokeAll flag required");
    }

    await sessionManagementService.revokeSession(sessionId, reason);
    return NextResponse.json({ success: true, message: "Session revoked" });
  } catch (error) {
    logger.error("Failed to revoke session", { error });
    return ErrorHandler.serverError(error);
  }
}
