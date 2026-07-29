import type { DeliveryRecord } from './types';
import { getWebhookConfig } from './config';

export interface RetryScheduler {
  calculateBackoff(attemptNumber: number, retryAfterSeconds?: number): number;
  scheduleNext(record: DeliveryRecord): Promise<DeliveryRecord>;
  hasRemainingAttempts(record: DeliveryRecord): boolean;
}

/**
 * Calculates the backoff interval in milliseconds for a given attempt number.
 *
 * Formula: base * 2^(n-1) + random jitter up to 25%
 * If retryAfterSeconds is provided (from a 429 Retry-After header), it is used
 * as the base interval instead of the exponential formula (Property 6).
 */
export function calculateBackoff(attemptNumber: number, retryAfterSeconds?: number): number {
  const config = getWebhookConfig();
  const { baseDelaySeconds, jitterFactor } = config;

  let baseMs: number;
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    // Property 6: respect Retry-After header value
    baseMs = retryAfterSeconds * 1000;
  } else {
    // Property 1: base * 2^(n-1)
    baseMs = baseDelaySeconds * Math.pow(2, attemptNumber - 1) * 1000;
  }

  // Property 2: add random jitter up to 25%
  const jitter = Math.random() * jitterFactor * baseMs;
  return baseMs + jitter;
}

/**
 * Returns true if the record has remaining retry attempts available.
 */
export function hasRemainingAttempts(record: DeliveryRecord): boolean {
  return record.attemptCount < record.maxAttempts;
}

/**
 * Schedules the next attempt by updating nextAttemptAt on the record.
 * Uses the current attemptCount to determine the backoff interval.
 */
export async function scheduleNext(record: DeliveryRecord): Promise<DeliveryRecord> {
  const delayMs = calculateBackoff(record.attemptCount);
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  return {
    ...record,
    nextAttemptAt,
    updatedAt: new Date().toISOString(),
  };
}

export const retryScheduler: RetryScheduler = {
  calculateBackoff,
  scheduleNext,
  hasRemainingAttempts,
};
