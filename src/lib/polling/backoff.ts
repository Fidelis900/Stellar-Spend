export interface PollingConfig {
  baseDelay: number; // ms, default 2000
  maxDelay: number; // ms, default 30000
  jitterFactor: number; // 0–1, default 0.2 (20%)
  requestTimeoutMs: number; // default 8000
  maxTotalDurationMs: number; // bridge: 300000, payout: 600000
  maxConsecutiveErrors: number; // bridge: 10, payout: 5
}

export interface BackoffCalculator {
  calculate(
    attempt: number,
    config: Pick<PollingConfig, 'baseDelay' | 'maxDelay' | 'jitterFactor'>,
  ): number;
}

/**
 * Calculates the backoff interval in milliseconds.
 * Formula: min(base * 2^(attempt-1), max) + random jitter up to jitterFactor * base_interval
 */
export function calculateBackoff(
  attempt: number,
  config: Pick<PollingConfig, 'baseDelay' | 'maxDelay' | 'jitterFactor'>,
): number {
  const { baseDelay, maxDelay, jitterFactor } = config;
  const baseInterval = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  const jitter = Math.random() * jitterFactor * baseInterval;
  return baseInterval + jitter;
}

export const backoffCalculator: BackoffCalculator = {
  calculate: calculateBackoff,
};

export const BRIDGE_CONFIG: PollingConfig = {
  baseDelay: 2000,
  maxDelay: 30000,
  jitterFactor: 0.2,
  requestTimeoutMs: 8000,
  maxTotalDurationMs: 300_000, // 5 min
  maxConsecutiveErrors: 10,
};

export const PAYOUT_CONFIG: PollingConfig = {
  baseDelay: 2000,
  maxDelay: 30000,
  jitterFactor: 0.2,
  requestTimeoutMs: 8000,
  maxTotalDurationMs: 600_000, // 10 min
  maxConsecutiveErrors: 5,
};
