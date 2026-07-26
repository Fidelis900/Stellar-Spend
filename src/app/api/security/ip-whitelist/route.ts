import { NextRequest, NextResponse } from "next/server";
import { ipWhitelistService } from "@/lib/ip-whitelist";
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

export async function GET(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const whitelistedIPs = await ipWhitelistService.getWhitelistedIPs(userAddress);
    return NextResponse.json({ ips: whitelistedIPs });
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
    const { ipAddress, ipRangeStart, ipRangeEnd, label } = body;

    if (ipAddress) {
      const entry = await ipWhitelistService.addIPAddress(
        userAddress,
        ipAddress,
        label,
      );
      return NextResponse.json(entry, { status: 201 });
    }

    if (ipRangeStart && ipRangeEnd) {
      const entry = await ipWhitelistService.addIPRange(
        userAddress,
        ipRangeStart,
        ipRangeEnd,
        label,
      );
      return NextResponse.json(entry, { status: 201 });
    }

    return ErrorHandler.validation("Either ipAddress or ipRange (start/end) required");
  } catch (error) {
    logger.error("Failed to add IP to whitelist", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to add IP to whitelist"));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("id");

    if (!entryId) {
      return ErrorHandler.validation("Entry ID required");
    }

    await ipWhitelistService.removeIPEntry(userAddress, entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to remove IP from whitelist", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to remove IP from whitelist"));
  }
}
