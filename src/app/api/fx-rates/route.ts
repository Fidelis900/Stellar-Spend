import { logger } from '@/lib/logger';
import { NextResponse } from "next/server";
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 10;
// Revalidate every 30 s at the edge
export const revalidate = 30;

const CURRENCIES = ["NGN", "KES", "GHS", "ZAR", "USD"];
const PAYCREST_BASE = "https://api.paycrest.io/v1/rates/USDC/1";

export interface FxRate {
  currency: string;
  rate: number;
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      CURRENCIES.map((c) =>
        fetch(`${PAYCREST_BASE}/${c}?network=base`, { next: { revalidate: 30 } })
          .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
          .then((data) => ({ currency: c, rate: parseFloat(data.rate ?? "0") }))
      )
    );

    const rates: FxRate[] = results
      .filter(
        (r): r is PromiseFulfilledResult<FxRate> =>
          r.status === "fulfilled" && !isNaN(r.value.rate) && r.value.rate > 0
      )
      .map((r) => r.value);

    if (rates.length === 0) {
      return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, "No rates available"));
    }

    return NextResponse.json(
      { rates },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } }
    );
  } catch (error) {
    logger.error("fx-rates error:", {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, "Failed to fetch rates"));
  }
}
