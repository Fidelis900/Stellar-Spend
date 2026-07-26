import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { ErrorHandler } from "@/lib/error-handler";

interface CSPReport {
  "csp-report": {
    "document-uri": string;
    "violated-directive": string;
    "effective-directive": string;
    "original-policy": string;
    "disposition": string;
    "blocked-uri"?: string;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
    "status-code"?: number;
  };
}

/**
 * CSP violation reporting endpoint
 * Receives and logs Content Security Policy violations
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CSPReport;
    const report = body["csp-report"];

    logger.warn("CSP Violation Detected", {
      documentUri: report["document-uri"],
      violatedDirective: report["violated-directive"],
      effectiveDirective: report["effective-directive"],
      blockedUri: report["blocked-uri"],
      sourceFile: report["source-file"],
      lineNumber: report["line-number"],
      columnNumber: report["column-number"],
      statusCode: report["status-code"],
      disposition: report["disposition"],
    });

    // In production, you might want to send this to an external monitoring service
    // or store it in a database for analysis

    return NextResponse.json({ success: true }, { status: 204 });
  } catch (error) {
    logger.error("Failed to process CSP report", { error });
    return ErrorHandler.validation("Failed to process report");
  }
}
