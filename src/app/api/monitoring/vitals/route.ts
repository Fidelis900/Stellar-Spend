import { type NextRequest, NextResponse } from "next/server";
import { recordVital, recordFunnelEvent } from "@/lib/performance";
import { ErrorHandler } from "@/lib/error-handler";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Web Vitals payload: { name, value, rating?, url?, ts? }
    if (typeof body.name === "string" && typeof body.value === "number") {
      const { name, value, rating, url, ts } = body;
      recordVital({ name, value, rating: rating ?? "unknown", url: url ?? "/", timestamp: ts ?? Date.now() });
      return new NextResponse(null, { status: 204 });
    }

    // Analytics / funnel event payload: { category, action, sessionId?, ... }
    if (typeof body.category === "string" && typeof body.action === "string") {
      if (body.category === "Funnel") {
        recordFunnelEvent({
          action: body.action,
          sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          timestamp: body.timestamp ? new Date(body.timestamp).getTime() : Date.now(),
        });
      }
      return new NextResponse(null, { status: 204 });
    }

    return ErrorHandler.validation("Invalid payload");
  } catch {
    return ErrorHandler.validation("Bad request");
  }
}
