import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { decodeTxResultXdr } from '@/lib/offramp';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import { sorobanRpcBreaker, CircuitOpenError } from '@/lib/circuit-breaker';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  return withIdempotency(
    req,
    async () => {
      try {
        const { signedXdr } = await req.json();

        if (!signedXdr) {
          return ErrorHandler.validation('signedXdr is required');
        }

        const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL;
        if (!rpcUrl) {
          return ErrorHandler.handle(
            new ApiError(ErrorType.SERVER_ERROR, 'Soroban RPC URL not configured'),
          );
        }

        let data: Record<string, unknown>;
        try {
          data = await sorobanRpcBreaker.execute(
            () =>
              fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'sendTransaction',
                  params: { transaction: signedXdr },
                }),
              }).then((res) => res.json() as Promise<Record<string, unknown>>),
            {
              fallback: () => ({
                error: {
                  code: -1,
                  message:
                    'Soroban RPC is currently unavailable (circuit open). Please try again shortly.',
                },
              }),
            },
          );
        } catch (err) {
          if (err instanceof CircuitOpenError) {
            return NextResponse.json(
              { error: 'Soroban RPC unavailable — please retry shortly.' },
              { status: 503 },
            );
          }
          throw err;
        }

        if (data.error) {
          const rpcError = data.error as { message?: string };
          return ErrorHandler.validation(rpcError.message ?? 'RPC error');
        }

        const result = data.result as Record<string, unknown> | undefined;
        const status = (result?.status as string) ?? 'PENDING';
        const hash = result?.hash as string | undefined;

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
          const errorMessage = decodeTxResultXdr(result?.errorResultXdr as string | undefined);

          if (result?.diagnosticEventsXdr) {
            logger.debug('Diagnostic events', { diagnosticEventsXdr: result.diagnosticEventsXdr });
          }

          return ErrorHandler.validation(errorMessage || 'Transaction failed');
        }

        return NextResponse.json({ status: status || 'PENDING', hash });
      } catch (err: unknown) {
        return ErrorHandler.serverError(err);
      }
    },
    { required: true },
  );
}
