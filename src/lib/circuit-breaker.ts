/**
 * Lightweight Circuit Breaker (#800)
 *
 * Pure-TypeScript implementation — no extra dependencies.
 *
 * States:
 *   CLOSED  — normal operation; failures are counted
 *   OPEN    — calls rejected immediately (fallback returned); resets after resetTimeoutMs
 *   HALF_OPEN — one probe call allowed; success → CLOSED, failure → OPEN
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ name: 'horizon', failureThreshold: 5 });
 *
 *   // Wrap any async call
 *   const result = await breaker.execute(() => fetch(horizonUrl), {
 *     fallback: () => ({ error: 'Horizon unavailable — circuit open' }),
 *   });
 *
 *   // Or: use the pre-built singletons for Stellar Horizon / Soroban RPC
 *   import { horizonBreaker, sorobanRpcBreaker } from './circuit-breaker';
 */

import { logger } from '@/lib/logger';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface CircuitBreakerOptions {
  /** Human-readable name for observability */
  name: string;
  /** Number of consecutive failures before opening */
  failureThreshold?: number;
  /** Time in ms to wait in OPEN state before attempting HALF_OPEN */
  resetTimeoutMs?: number;
  /** Optional: number of successful half-open probes before fully closing */
  halfOpenSuccessThreshold?: number;
  /** Optional: request timeout in ms — if the wrapped fn takes longer, it counts as a failure */
  timeoutMs?: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  lastFailureAt: number | null;
  nextAttemptAt: number | null;
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly timeoutMs: number;

  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private halfOpenSuccesses = 0;
  private lastFailureAt: number | null = null;
  private openedAt: number | null = null;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 1;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /**
   * Execute `fn` through the circuit breaker.
   *
   * @param fn - The async function to protect (e.g. a fetch call)
   * @param opts.fallback - Optional function called when the breaker is OPEN.
   *                        If not provided and breaker is OPEN, a CircuitOpenError is thrown.
   */
  async execute<T>(fn: () => Promise<T>, opts?: { fallback?: () => T | Promise<T> }): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === 'OPEN') {
      logger.warn('circuit-breaker.open', { name: this.name });
      if (opts?.fallback) return opts.fallback();
      throw new CircuitOpenError(this.name, this.openedAt ?? 0, this.resetTimeoutMs);
    }

    if (this.state === 'HALF_OPEN') {
      logger.debug('circuit-breaker.half-open-probe', { name: this.name });
    }

    try {
      const result = await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  /** Returns a snapshot of the circuit's current status (for health endpoints). */
  getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      nextAttemptAt: this.openedAt !== null ? this.openedAt + this.resetTimeoutMs : null,
    };
  }

  /** Reset the circuit breaker to CLOSED state (e.g. after a deployment). */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
    logger.info('circuit-breaker.reset', { name: this.name });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private maybeTransitionToHalfOpen(): void {
    if (
      this.state === 'OPEN' &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.state = 'HALF_OPEN';
      this.halfOpenSuccesses = 0;
      logger.info('circuit-breaker.half-open', { name: this.name });
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.openedAt = null;
        logger.info('circuit-breaker.closed', { name: this.name });
      }
    } else {
      // Reset failure counter on success in CLOSED state
      this.failures = 0;
    }
  }

  private onFailure(err: unknown): void {
    this.failures++;
    this.lastFailureAt = Date.now();
    logger.warn(
      'circuit-breaker.failure',
      { name: this.name, failures: this.failures, threshold: this.failureThreshold },
      err,
    );

    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      logger.error('circuit-breaker.opened', { name: this.name, failures: this.failures });
    }
  }

  private withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (this.timeoutMs <= 0) return fn();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CircuitTimeoutError(this.name, this.timeoutMs));
      }, this.timeoutMs);

      fn().then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly openedAt: number,
    public readonly resetTimeoutMs: number,
  ) {
    super(
      `Circuit '${circuitName}' is OPEN — upstream unavailable. Retry after ${resetTimeoutMs / 1000}s.`,
    );
    this.name = 'CircuitOpenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CircuitTimeoutError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly timeoutMs: number,
  ) {
    super(`Circuit '${circuitName}' call timed out after ${timeoutMs}ms`);
    this.name = 'CircuitTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Singletons for Stellar Horizon / Soroban RPC ────────────────────────────

/**
 * Circuit breaker for outbound Stellar Horizon API calls.
 * Opens after 5 consecutive failures; resets after 30 s.
 */
export const horizonBreaker = new CircuitBreaker({
  name: 'stellar-horizon',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  timeoutMs: 15_000,
});

/**
 * Circuit breaker for outbound Soroban RPC calls.
 * Opens after 5 consecutive failures; resets after 30 s.
 */
export const sorobanRpcBreaker = new CircuitBreaker({
  name: 'soroban-rpc',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  timeoutMs: 15_000,
});

/**
 * Circuit breaker for Allbridge bridge SDK calls.
 * Opens after 5 consecutive failures; resets after 60 s (SDK is slower to recover).
 */
export const allbridgeBreaker = new CircuitBreaker({
  name: 'allbridge',
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  timeoutMs: 20_000,
});
