import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getCorridorInstitutions, getCorridorConfig } from '@/lib/corridor-config';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 10;

// Edge / CDN cache: 1 hour fresh + 24 hours stale-while-revalidate
const CACHE_CONTROL_HEADER = 'public, max-age=3600, stale-while-revalidate=86400';

interface PaycrestHttpError extends Error {
  status: number;
}

class PaycrestAdapter {
  private apiKey: string;
  private apiUrl = 'https://api.paycrest.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getInstitutions(currency: string) {
    const response = await fetch(
      `${this.apiUrl}/institutions/${encodeURIComponent(currency)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(
        data?.message ?? `Failed to fetch institutions: ${response.status}`
      ) as PaycrestHttpError;
      error.status = response.status;
      throw error;
    }

    return Array.isArray(data) ? data : (data.institutions ?? []);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ currency: string }> }) {
  const { currency } = await params;

  try {
    const paycrest = new PaycrestAdapter(env.server.PAYCREST_API_KEY);
    const institutions = await paycrest.getInstitutions(currency);

    return NextResponse.json(institutions, {
      headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
    });
  } catch (err: unknown) {
    logger.error('Error fetching institutions from Paycrest:', {}, err);

    // Fallback to corridor-config institutions when Paycrest is unreachable
    const corridorConfig = getCorridorConfig(currency);
    if (corridorConfig && corridorConfig.institutions.length > 0) {
      const fallback = corridorConfig.institutions.map((inst) => ({
        id: inst.id,
        name: inst.name,
        code: inst.code,
        type: inst.type,
      }));
      return NextResponse.json(fallback, {
        headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
      });
    }

    if (err instanceof Error && 'status' in err) {
      const httpError = err as PaycrestHttpError;
      if (httpError.status === 400 || httpError.status === 404) {
        return ErrorHandler.validation(`Unsupported currency: ${currency}`);
      }
      return ErrorHandler.handle(err, httpError.status);
    }

    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Internal server error'));
  }
}
