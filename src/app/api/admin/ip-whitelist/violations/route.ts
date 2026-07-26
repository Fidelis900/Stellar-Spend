import { NextRequest, NextResponse } from "next/server";
import { ipWhitelistService } from "@/lib/ip-whitelist";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";
import { ApiError, ErrorType } from "@/lib/error-types";

export async function GET(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);

    const violations = await ipWhitelistService.getViolations(userAddress, limit);
    return NextResponse.json({ violations, count: violations.length });
  } catch (error) {
    logger.error("Failed to fetch IP violations", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch IP violations"));
  }
}
