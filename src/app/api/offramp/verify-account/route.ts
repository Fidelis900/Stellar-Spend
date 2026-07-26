import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 10;

interface PaycrestHttpError extends Error {
  status: number;
}

class PaycrestAdapter {
  private apiKey: string;
  private apiUrl = 'https://api.paycrest.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async verifyAccount(institution: string, accountIdentifier: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}/verify-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey,
      },
      body: JSON.stringify({ institution, accountIdentifier }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data?.message ?? `Verification failed: ${response.status}`) as PaycrestHttpError;
      error.status = response.status;
      throw error;
    }

    return data.accountName ?? data.data?.accountName ?? data.data?.account_name ?? String(data.data ?? '');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { institution, accountIdentifier } = body;

    if (!institution || !accountIdentifier) {
      return ErrorHandler.validation('institution and accountIdentifier are required');
    }

    const paycrest = new PaycrestAdapter(env.server.PAYCREST_API_KEY);
    const accountName = await paycrest.verifyAccount(institution, accountIdentifier);

    return NextResponse.json({ accountName });
  } catch (err: unknown) {
    logger.error('Error verifying account via Paycrest:', {}, err);

    if (err instanceof Error && 'status' in err) {
      const httpError = err as PaycrestHttpError;
      const status = httpError.status >= 500 ? 502 : 400;
      return ErrorHandler.handle(err, status);
    }

    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Internal server error'));
  }
}
