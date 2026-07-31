'use client';

import { useCallback } from 'react';
import type { PayoutStatus } from '@/lib/offramp';
import { TransactionStorage } from '@/lib/transaction-storage';
import type { OfframpStep } from '@shared/types/stellaramp';
import {
  usePollingManager,
  DurationExceededError,
  ConsecutiveErrorsExceededError,
} from '@/lib/polling';
import type { StatusResponse } from '@/lib/polling';
import { PAYOUT_CONFIG } from '@/lib/polling';

const TERMINAL_STATES: PayoutStatus[] = ['validated', 'settled', 'refunded', 'expired'];

interface PollPayoutStatusOptions {
  transactionId: string;
  onStepChange: (step: OfframpStep) => void;
  onSettling?: () => void;
}

/**
 * Polls GET /api/offramp/status/{orderId} using exponential backoff, up to 10 min.
 * - "validated" | "settled"  → calls onSettling(), resolves
 * - "refunded" | "expired"   → rejects with descriptive error
 * - 5 consecutive HTTP errors → rejects with descriptive connectivity error
 * - Timeout                  → rejects with "Payout polling timeout"
 * Updates TransactionStorage on every poll.
 */
export function usePollPayoutStatus() {
  const { start } = usePollingManager(PAYOUT_CONFIG);

  const pollPayoutStatus = useCallback(
    async (
      orderId: string,
      { transactionId, onSettling }: PollPayoutStatusOptions,
    ): Promise<void> => {
      const fetchFn = async (id: string, signal: AbortSignal): Promise<StatusResponse> => {
        const res = await fetch(`/api/offramp/status/${id}`, {
          cache: 'no-store',
          signal,
        });

        const data: { status?: PayoutStatus; error?: string } = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to fetch payout status');
        }

        const status: PayoutStatus = (data.status ?? 'pending') as PayoutStatus;

        // Persist each poll result
        TransactionStorage.update(transactionId, { payoutStatus: status });

        const isTerminal = TERMINAL_STATES.includes(status);

        return { status, id, isTerminal };
      };

      try {
        const result = await start(orderId, fetchFn, () => {});

        const status = result.status as PayoutStatus;

        if (status === 'validated' || status === 'settled') {
          onSettling?.();
          return;
        }

        if (status === 'refunded' || status === 'expired') {
          throw new Error(
            status === 'refunded'
              ? 'Payout was refunded. Please contact support.'
              : 'Payout order expired. Please try again.',
          );
        }
      } catch (err) {
        if (err instanceof DurationExceededError) {
          throw new Error('Payout polling timeout');
        }
        if (err instanceof ConsecutiveErrorsExceededError) {
          throw new Error(
            'Payout polling failed: too many consecutive network errors. Please check your connection.',
          );
        }
        throw err;
      }
    },
    [start],
  );

  return { pollPayoutStatus };
}
