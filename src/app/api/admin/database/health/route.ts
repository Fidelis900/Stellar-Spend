import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/client";
import { queryOptimizer } from "@/lib/db/query-optimizer";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";
import { ApiError, ErrorType } from "@/lib/error-types";

export async function GET(request: NextRequest) {
  try {
    const start = Date.now();

    // Test database connection
    const result = await pool.query("SELECT NOW()");
    const connectionTime = Date.now() - start;

    // Get query statistics
    const queryStats = queryOptimizer.getStatistics();

    // Get slow queries
    const slowQueries = queryOptimizer.getSlowQueries(5);

    const health = {
      status: "healthy",
      timestamp: Date.now(),
      database: {
        connected: true,
        responseTime: connectionTime,
        lastCheck: result.rows[0].now,
      },
      queries: {
        total: queryStats.totalQueries,
        averageExecutionTime: queryStats.averageExecutionTime,
        slowQueryCount: queryStats.slowQueryCount,
        topQueries: queryStats.topQueries,
      },
      slowQueries: slowQueries.map((q) => ({
        query: q.query,
        executionTime: q.executionTime,
        timestamp: q.timestamp,
      })),
    };

    return NextResponse.json(health);
  } catch (error) {
    logger.error("Database health check failed", { error });
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Database connection failed", 503));
  }
}
