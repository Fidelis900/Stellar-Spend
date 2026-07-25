'use client';

import { useCallback } from 'react';
import { usePollingManager, DurationExceededError, ConsecutiveErrorsExceededError } from '@/lib/polling/polling-manager';
import type { StatusResponse } from '@/lib/polling/polling-manager';
import type { PollingConfig } from '@/lib/polling/backoff';

export interface UsePollingOptions<T> {
  config: PollingConfig;
  terminalStates: T[];
  onTerminalState?: (state: T) => void;
  onError?: (error: Error) => void;
  updateStorage?: (status: T) => void;
}

export interface PollStatusOptions {
  id: string;
  onSuccess?: () => void;
}

/**
 * Generic polling hook for status endpoints
 * Handles common polling patterns: terminal states, error handling, storage updates
 */
export function useGenericPolling<T extends string, D = unknown>({
  config,
  terminalStates,
  onTerminalState,
  onError,
  updateStorage,
}: UsePollingOptions<T>) {
  const { start } = usePollingManager(config);

  const pollStatus = useCallback(
    async (
      endpoint: string,
      options: PollStatusOptions,
      parseResponse: (data: D) => T
    ): Promise<void> => {
      const fetchFn = async (id: string, signal: AbortSignal): Promise<StatusResponse> => {
        const res = await fetch(endpoint, {
          cache: 'no-store',
          signal,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to fetch status');
        }

        const status = parseResponse(data);

        // Update storage if provided
        updateStorage?.(status);

        const isTerminal = terminalStates.includes(status);

        return { status, id, isTerminal };
      };

      try {
        const result = await start(options.id, fetchFn, () => {});
        const status = result.status as T;

        if (terminalStates.includes(status)) {
          onTerminalState?.(status);
          options.onSuccess?.();
          return;
        }
      } catch (err) {
        if (err instanceof DurationExceededError) {
          const error = new Error('Polling timeout');
          onError?.(error);
          throw error;
        }
        if (err instanceof ConsecutiveErrorsExceededError) {
          const error = new Error('Too many consecutive network errors. Please check your connection.');
          onError?.(error);
          throw error;
        }
        throw err;
      }
    },
    [start, terminalStates, onTerminalState, onError, updateStorage]
  );

  return { pollStatus };
}
