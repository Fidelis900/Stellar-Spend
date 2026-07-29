'use client';

import { useCallback, useRef } from 'react';
import { calculateBackoff, type PollingConfig } from './backoff';
import { connectWebSocket } from './websocket-client';
import type { StatusPush } from './ws-server';

export interface PollingState {
  elapsedMs: number;
  remainingMs: number;
  attemptNumber: number;
}

export interface StatusResponse {
  status: string;
  id: string;
  isTerminal: boolean;
  cachedAt?: number;
  upstreamError?: string;
}

// Module-level deduplication map: id → AbortController of the in-flight request
// Requirement 4.1, 4.3, 4.4
const inFlight = new Map<string, AbortController>();

export function usePollingManager(config: PollingConfig): {
  start(
    id: string,
    fetchFn: (id: string, signal: AbortSignal) => Promise<StatusResponse>,
    onUpdate: (state: PollingState) => void,
  ): Promise<StatusResponse>;
  stop(): void;
} {
  // Ref to signal the polling loop to stop (e.g. on component unmount)
  const stoppedRef = useRef(false);
  // Ref to the current request's AbortController so stop() can abort it
  const currentControllerRef = useRef<AbortController | null>(null);
  // Ref to the visibility-change handler so we can remove it on stop
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  // Ref to the sleep-resolve function so visibility resume can wake the loop
  const sleepResolveRef = useRef<(() => void) | null>(null);
  // Ref to the WebSocket cleanup function
  const wsCleanupRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    currentControllerRef.current?.abort();
    // Close any active WebSocket connection
    wsCleanupRef.current?.();
    wsCleanupRef.current = null;
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }
    // Wake any sleeping interval so the loop can exit promptly
    sleepResolveRef.current?.();
  }, []);

  const start = useCallback(
    async (
      id: string,
      fetchFn: (id: string, signal: AbortSignal) => Promise<StatusResponse>,
      onUpdate: (state: PollingState) => void,
    ): Promise<StatusResponse> => {
      stoppedRef.current = false;

      const startTime = Date.now();
      let attemptNumber = 0;
      let consecutiveErrors = 0;
      let paused = false;

      // Page Visibility API — pause when hidden, resume when visible (Req 4.5, 4.6)
      const visibilityHandler = () => {
        if (document.visibilityState === 'hidden') {
          paused = true;
        } else {
          paused = false;
          // Wake the sleep so we poll immediately on resume (Req 4.6)
          sleepResolveRef.current?.();
        }
      };
      visibilityHandlerRef.current = visibilityHandler;
      document.addEventListener('visibilitychange', visibilityHandler);

      // ----------------------------------------------------------------
      // WebSocket-first: attempt WS connection before starting HTTP polling
      // Property 6: while WS is active, HTTP polling is suspended
      // Property 7: when WS closes/errors, fall back to HTTP polling
      // Requirements: 2.3, 2.4, 4.2
      // ----------------------------------------------------------------
      let wsActive = false;
      // Resolve function to wake the HTTP polling loop when WS closes
      let wsClosedResolve: (() => void) | null = null;
      // Promise that resolves when the WS connection closes
      let wsClosedPromise: Promise<void> | null = null;

      // Promise that resolves with a terminal StatusResponse if WS delivers one
      let wsTerminalResolve: ((r: StatusResponse) => void) | null = null;
      const wsTerminalPromise = new Promise<StatusResponse | null>((resolve) => {
        wsTerminalResolve = (r) => resolve(r);
      });

      // Attempt WebSocket connection
      try {
        wsClosedPromise = new Promise<void>((resolve) => {
          wsClosedResolve = resolve;
        });

        const wsCleanup = connectWebSocket(
          id,
          (push: StatusPush) => {
            if (stoppedRef.current) return;

            // Convert StatusPush to StatusResponse shape
            const response: StatusResponse = {
              id: push.id,
              status: push.status,
              isTerminal: push.isTerminal,
            };

            const nowElapsed = Date.now() - startTime;
            const nowRemaining = config.maxTotalDurationMs - nowElapsed;
            attemptNumber++;
            onUpdate({ elapsedMs: nowElapsed, remainingMs: nowRemaining, attemptNumber });

            if (push.isTerminal) {
              // Terminal state via WS — resolve the whole start() promise
              wsTerminalResolve?.(response);
            }
          },
          () => {
            // WS closed or errored — wake HTTP polling fallback
            wsActive = false;
            wsCleanupRef.current = null;
            wsClosedResolve?.();
          },
        );

        wsActive = true;
        wsCleanupRef.current = wsCleanup;
      } catch {
        // WebSocket constructor threw (e.g. in SSR/test env) — fall through to HTTP
        wsActive = false;
        wsClosedPromise = Promise.resolve();
      }

      try {
        // If WS connected, wait for either a terminal push or the WS to close
        if (wsActive && wsClosedPromise) {
          const result = await Promise.race([
            wsTerminalPromise,
            wsClosedPromise.then(() => null as StatusResponse | null),
          ]);

          if (stoppedRef.current) {
            throw new AbortError('polling stopped');
          }

          if (result !== null) {
            // Terminal state delivered via WebSocket
            return result;
          }
          // WS closed without terminal state — fall through to HTTP polling
        }

        // Resolve the wsTerminalPromise so it doesn't linger
        wsTerminalResolve?.(null as unknown as StatusResponse);

        // ----------------------------------------------------------------
        // HTTP polling loop (fallback or primary when WS unavailable)
        // ----------------------------------------------------------------
        while (!stoppedRef.current) {
          const elapsedMs = Date.now() - startTime;
          const remainingMs = config.maxTotalDurationMs - elapsedMs;

          // Total duration exceeded — caller decides resolve vs reject
          if (remainingMs <= 0) {
            throw new DurationExceededError('max total duration exceeded');
          }

          // Wait while paused (tab hidden)
          while (paused && !stoppedRef.current) {
            await new Promise<void>((resolve) => {
              sleepResolveRef.current = resolve;
            });
            sleepResolveRef.current = null;
          }

          if (stoppedRef.current) break;

          attemptNumber++;

          // Deduplication: abort any existing in-flight request for this id (Req 4.1)
          if (inFlight.has(id)) {
            inFlight.get(id)!.abort();
          }

          // Per-request AbortController with 8s timeout (Req 5.1, 5.2)
          const controller = new AbortController();
          currentControllerRef.current = controller;
          inFlight.set(id, controller);

          const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

          let response: StatusResponse | null = null;
          let requestFailed = false;

          try {
            response = await fetchFn(id, controller.signal);
            consecutiveErrors = 0;
          } catch {
            requestFailed = true;
            consecutiveErrors++;
          } finally {
            clearTimeout(timeoutId);
            // Only remove from inFlight if this controller is still the current one
            if (inFlight.get(id) === controller) {
              inFlight.delete(id);
            }
          }

          if (stoppedRef.current) break;

          const nowElapsed = Date.now() - startTime;
          const nowRemaining = config.maxTotalDurationMs - nowElapsed;

          // Notify caller of current state (Req 5.7)
          onUpdate({ elapsedMs: nowElapsed, remainingMs: nowRemaining, attemptNumber });

          // Check consecutive error threshold
          if (requestFailed) {
            if (consecutiveErrors >= config.maxConsecutiveErrors) {
              throw new ConsecutiveErrorsExceededError(
                `${consecutiveErrors} consecutive poll failures`,
              );
            }
          } else if (response) {
            // Terminal state — stop immediately (Req 1.4)
            if (response.isTerminal) {
              return response;
            }
          }

          // Check total duration again before sleeping
          const elapsedBeforeSleep = Date.now() - startTime;
          if (elapsedBeforeSleep >= config.maxTotalDurationMs) {
            throw new DurationExceededError('max total duration exceeded');
          }

          // Backoff sleep (Req 1.1, 1.2, 1.3)
          const delay = calculateBackoff(attemptNumber, config);
          await new Promise<void>((resolve) => {
            sleepResolveRef.current = resolve;
            setTimeout(resolve, delay);
          });
          sleepResolveRef.current = null;
        }

        // Loop exited because stop() was called
        throw new AbortError('polling stopped');
      } finally {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandlerRef.current = null;
        // Clean up WebSocket if still open
        wsCleanupRef.current?.();
        wsCleanupRef.current = null;
      }
    },
    [config],
  );

  return { start, stop };
}

// Typed error classes so callers can distinguish stop reasons
export class DurationExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DurationExceededError';
  }
}

export class ConsecutiveErrorsExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsecutiveErrorsExceededError';
  }
}

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}
