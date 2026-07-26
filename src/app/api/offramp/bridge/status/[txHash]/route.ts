import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { extractErrorMessage } from '@/lib/offramp/utils/errors';
import { get, set, isFresh } from '@/lib/polling/status-cache';
import type { BridgeStatus } from '@/lib/offramp/types';
import { ErrorHandler } from '@/lib/error-handler';

const BRIDGE_TERMINAL_STATES: BridgeStatus[] = ['completed', 'failed', 'expired'];

/**
 * GET /api/offramp/bridge/status/[txHash]
 *
 * Polls the Allbridge bridge transfer status.
 * Checks server-side cache before calling Allbridge; returns stale cache + upstreamError on failure.
 *
 * Response:
 * {
 *   data: {
 *     status: BridgeStatus
 *     txHash: string
 *     receiveAmount?: string
 *     cachedAt?: number
 *     upstreamError?: string
 *   }
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ txHash: string }> }
) {
  const { txHash } = await params;

  // Check cache first
  const cached = get(txHash);
  if (cached && isFresh(cached)) {
    const raw = cached.raw as { receiveAmount?: string };
    return NextResponse.json({
      data: {
        status: cached.status as BridgeStatus,
        txHash,
        receiveAmount: raw?.receiveAmount,
        cachedAt: cached.cachedAt,
      },
    });
  }

  try {
    // Initialize Allbridge SDK
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await import('@allbridge/bridge-core-sdk');

    const sdk = new AllbridgeCoreSdk({ ...nodeRpcUrlsDefault });

    // Get transfer status from Allbridge
    let transferStatus: any;
    try {
      transferStatus = await sdk.getTransferStatus('SRB', txHash);
    } catch (error) {
      // Handle 404 gracefully - return pending status
      const message = extractErrorMessage(error);
      if (message.includes('404') || message.includes('not found')) {
        const status: BridgeStatus = 'pending';
        const entry = {
          status,
          raw: { receiveAmount: undefined },
          cachedAt: Date.now(),
          isTerminal: false,
        };
        set(txHash, entry);
        return NextResponse.json({
          data: { status, txHash },
        });
      }

      // Upstream error — return stale cache if available
      if (cached) {
        const raw = cached.raw as { receiveAmount?: string };
        return NextResponse.json({
          data: {
            status: cached.status as BridgeStatus,
            txHash,
            receiveAmount: raw?.receiveAmount,
            cachedAt: cached.cachedAt,
            upstreamError: message || 'Failed to fetch bridge status',
          },
        });
      }

      throw error;
    }

    // Map Allbridge status to BridgeStatus type
    let status: BridgeStatus = 'pending';
    if (transferStatus?.status) {
      const allbridgeStatus = transferStatus.status.toLowerCase();
      if (allbridgeStatus.includes('completed') || allbridgeStatus.includes('success')) {
        status = 'completed';
      } else if (allbridgeStatus.includes('failed')) {
        status = 'failed';
      } else if (allbridgeStatus.includes('expired')) {
        status = 'expired';
      } else if (allbridgeStatus.includes('processing')) {
        status = 'processing';
      }
    }

    const isTerminal = BRIDGE_TERMINAL_STATES.includes(status);
    const raw = { receiveAmount: transferStatus?.receiveAmount };

    // Populate cache
    set(txHash, {
      status,
      raw,
      cachedAt: Date.now(),
      isTerminal,
    });

    return NextResponse.json({
      data: {
        status,
        txHash,
        receiveAmount: transferStatus?.receiveAmount,
      },
    });
  } catch (error) {
    logger.error('Bridge status error:', {}, error);
    const message = extractErrorMessage(error);

    // Return stale cache entry with upstreamError if available
    if (cached) {
      const raw = cached.raw as { receiveAmount?: string };
      return NextResponse.json({
        data: {
          status: cached.status as BridgeStatus,
          txHash,
          receiveAmount: raw?.receiveAmount,
          cachedAt: cached.cachedAt,
          upstreamError: message || 'Failed to fetch bridge status',
        },
      });
    }

    return ErrorHandler.serverError(error);
  }
}
