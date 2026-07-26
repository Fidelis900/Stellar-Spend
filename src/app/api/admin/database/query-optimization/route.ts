import { NextRequest, NextResponse } from "next/server";
import { queryOptimizer } from "@/lib/db/query-optimizer";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "analysis";

    if (type === "slow") {
      const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
      const slowQueries = queryOptimizer.getSlowQueries(limit);
      return NextResponse.json({ slowQueries, count: slowQueries.length });
    }

    if (type === "stats") {
      const stats = queryOptimizer.getStatistics();
      return NextResponse.json(stats);
    }

    // Default: full analysis
    const analysis = queryOptimizer.analyzeQueries();
    return NextResponse.json(analysis);
  } catch (error) {
    logger.error("Failed to fetch query optimization data", { error });
    return ErrorHandler.serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "clear-metrics") {
      queryOptimizer.clearMetrics();
      return NextResponse.json({ success: true, message: "Metrics cleared" });
    }

    return ErrorHandler.validation("Unknown action");
  } catch (error) {
    logger.error("Failed to process query optimization request", { error });
    return ErrorHandler.serverError(error);
  }
}
