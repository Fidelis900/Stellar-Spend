import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { decodeTxResultXdr } from '@/lib/offramp/utils/errors';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const { signedXdr } = await req.json();

      if (!signedXdr) {
        return ErrorHandler.validation('signedXdr is required');
      }

      const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL;
      if (!rpcUrl) {
        return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Soroban RPC URL not configured'));
      }

      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: { transaction: signedXdr },
        }),
      });

      const data = await res.json();

      if (data.error) {
        return ErrorHandler.validation(data.error.message ?? 'RPC error');
      }

      const result = data.result;
      const status = result?.status ?? 'PENDING';
      const hash = result?.hash;

      if (status === 'PENDING') {
        return NextResponse.json({ status: 'PENDING', hash });
      }

      if (status === 'SUCCESS') {
        return NextResponse.json({ status: 'SUCCESS', hash });
      }

      if (status === 'DUPLICATE') {
        return NextResponse.json({ status: 'PENDING', hash });
      }

      if (status === 'ERROR' || status === 'TRY_AGAIN_LATER') {
        const errorMessage = decodeTxResultXdr(result?.errorResultXdr);

        if (result?.diagnosticEventsXdr) {
          logger.error('Diagnostic events:', {}, result.diagnosticEventsXdr);
        }

        return ErrorHandler.validation(errorMessage || 'Transaction failed');
      }

      return NextResponse.json({ status: status || 'PENDING', hash });
    } catch (err: unknown) {
      return ErrorHandler.serverError(err);
    }
  }, { required: true });
}
