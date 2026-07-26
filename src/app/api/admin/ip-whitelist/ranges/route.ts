import { NextRequest, NextResponse } from "next/server";
import { ipWhitelistService } from "@/lib/ip-whitelist";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";
import { ApiError, ErrorType } from "@/lib/error-types";

export async function POST(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const body = await request.json();
    const { ipRangeStart, ipRangeEnd, label } = body;

    if (!ipRangeStart || !ipRangeEnd) {
      return ErrorHandler.validation("IP range start and end required");
    }

    const entry = await ipWhitelistService.addIPRange(
      userAddress,
      ipRangeStart,
      ipRangeEnd,
      label,
    );
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    logger.error("Failed to add IP range", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to add IP range"));
  }
}
