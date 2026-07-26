import { NextRequest, NextResponse } from "next/server";
import { ipWhitelistService } from "@/lib/ip-whitelist";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";
import { ApiError, ErrorType } from "@/lib/error-types";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { entryId: string } },
) {
  try {
    const userAddress = request.headers.get("x-user-address");
    if (!userAddress) {
      return ErrorHandler.validation("User address required");
    }

    const { entryId } = params;
    await ipWhitelistService.removeIPEntry(userAddress, entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to remove IP entry", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to remove IP entry"));
  }
}
