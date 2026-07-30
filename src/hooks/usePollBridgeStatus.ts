'use client';

import { useCallback } from 'react';
import type { BridgeStatus } from '@/lib/offramp';
import { TransactionStorage } from '@/lib/transaction-storage';
import {
  usePollingManager,
  DurationExceededError,
  ConsecutiveErrorsExceededError,
} from '@/lib/polling';
import type { StatusResponse } from '@/lib/polling';
import { BRIDGE_CONFIG } from '@/lib/polling';

const BRIDGE_TERMINAL_STATES: BridgeStatus[] = ['completed', 'failed', 'expired'];

interface PollBridgeStatusOptions {
  transactionId: string;
  onBridgeComplete?: () => void;
}

/**
 * Polls GET /api/offramp/bridge/status/{txHash} using exponential backoff, up to 5 min.
 * - "completed"  → calls onBridgeComplete(), resolves
 * - "failed"     → rejects with descriptive error
 * - 10 consecutive HTTP errors → soft exit (resolves without throwing)
 * - Timeout      → resolves silently (bridge polling is best-effort)
 * Updates TransactionStorage on every successful poll.
 */
export function usePollBridgeStatus() {
  const { start } = usePollingManager(BRIDGE_CONFIG);

  const pollBridgeStatus = useCallback(
    async (
      txHash: string,
      { transactionId, onBridgeComplete }: PollBridgeStatusOptions,
    ): Promise<void> => {
      const fetchFn = async (id: string, signal: AbortSignal): Promise<StatusResponse> => {
        const res = await fetch(`/api/offramp/bridge/status/${id}`, {
          cache: 'no-store',
          signal,
        });

        const data: { data?: { status?: BridgeStatus }; status?: BridgeStatus; error?: string } =
          await res.json();

        // Support both wrapped { data: { status } } and flat { status } response shapes
        const status: BridgeStatus = (data.data?.status ??
          data.status ??
          'pending') as BridgeStatus;

        if (status) {
          TransactionStorage.update(transactionId, { bridgeStatus: status });
        }

        const isTerminal = BRIDGE_TERMINAL_STATES.includes(status);

        return { status, id, isTerminal };
      };

      try {
        const result = await start(txHash, fetchFn, () => {});

        const status = result.status as BridgeStatus;

        if (status === 'completed') {
          onBridgeComplete?.();
          return;
        }

        if (status === 'failed' || status === 'expired') {
          throw new Error(
            status === 'failed'
              ? 'Bridge transfer failed. Please contact support.'
              : 'Bridge transfer expired. Please try again.',
          );
        }
      } catch (err) {
        // Total timeout or 10 consecutive errors → resolve silently (best-effort)
        if (err instanceof DurationExceededError || err instanceof ConsecutiveErrorsExceededError) {
          return;
        }
        throw err;
      }
    },
    [start],
  );

  return { pollBridgeStatus };
}
