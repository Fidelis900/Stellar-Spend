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

    const entries = await ipWhitelistService.getWhitelistedIPs(userAddress);
    return NextResponse.json({ entries });
  } catch (error) {
    logger.error("Failed to fetch whitelisted IPs", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch whitelisted IPs"));
  }
}

export async function POST(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const body = await request.json();
    const { ipAddress, label } = body;

    if (!ipAddress) {
      return ErrorHandler.validation("IP address required");
    }

    const entry = await ipWhitelistService.addIPAddress(userAddress, ipAddress, label);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    logger.error("Failed to add IP address", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to add IP address"));
  }
}
