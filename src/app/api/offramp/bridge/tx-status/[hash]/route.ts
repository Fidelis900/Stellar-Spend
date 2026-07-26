import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 10;

/**
 * GET /api/offramp/bridge/tx-status/[hash]
 * 
 * Polls the Soroban RPC for a transaction's status.
 * 
 * Response:
 * {
 *   status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND'
 *   hash: string
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;

  const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL;
  if (!rpcUrl) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Soroban RPC URL not configured'));
  }

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: { hash },
      }),
    });

    const data = await res.json();

    if (data.error) {
      return ErrorHandler.validation(data.error.message ?? 'RPC error');
    }

    const rpcStatus = data.result?.status ?? 'NOT_FOUND';

    // Map RPC status to simplified status
    let status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
    if (rpcStatus === 'SUCCESS') {
      status = 'SUCCESS';
    } else if (rpcStatus === 'FAILED') {
      status = 'FAILED';
    } else {
      status = 'NOT_FOUND';
    }

    return NextResponse.json({ status, hash });
  } catch (err: unknown) {
    return ErrorHandler.serverError(err);
  }
}
