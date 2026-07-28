import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';
import type { DeliveryRecord, DeliveryAttempt, WebhookPayload } from './types';
import { createRecord, updateRecord } from './delivery-store';
import { getWebhookConfig } from './config';
import { buildSignedWebhookHeaders } from './security';

export interface DeliveryAttemptResult {
  success: boolean;
  retryable: boolean;
  httpStatus?: number;
  errorType?: string;
  durationMs: number;
}

/**
 * Enqueue a new delivery record for the given payload and destination.
 */
export async function enqueue(
  payload: WebhookPayload,
  destination: string,
): Promise<DeliveryRecord> {
  const config = getWebhookConfig();
  return createRecord(destination, payload, config.maxAttempts);
}

/**
 * Build signed headers for outgoing webhook delivery using the provided secret.
 * Falls back to unsigned if no secret is provided.
 */
export async function buildOutgoingHeaders(
  payloadBody: string,
  signingSecret?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (signingSecret) {
    const signed = await buildSignedWebhookHeaders(payloadBody, signingSecret);
    Object.assign(headers, signed);
  }

  return headers;
}

/**
 * Execute a single delivery attempt for the given record.
 * Performs an HTTP POST, records the outcome, and updates the record in the store.
 */
export async function attempt(
  record: DeliveryRecord,
  signingSecret?: string,
): Promise<DeliveryAttemptResult> {
  const attemptNumber = record.attemptCount + 1;
  const startTime = Date.now();
  let httpStatus: number | undefined;
  let errorType: string | undefined;
  let success = false;
  let retryable = false;

  try {
    const deliveryHeaders = await buildOutgoingHeaders(record.payload.body, signingSecret);
    const response = await fetch(record.destinationUrl, {
      method: 'POST',
      headers: {
        ...deliveryHeaders,
        ...record.payload.headers,
      },
      body: record.payload.body,
    });

    httpStatus = response.status;
    const durationMs = Date.now() - startTime;

    if (httpStatus >= 200 && httpStatus < 300) {
      success = true;
      retryable = false;
    } else if (httpStatus === 429) {
      success = false;
      retryable = true;
    } else if (httpStatus >= 400 && httpStatus < 500) {
      // 4xx (except 429) — non-retryable
      success = false;
      retryable = false;
    } else {
      // 5xx
      success = false;
      retryable = true;
    }

    const deliveryAttempt: DeliveryAttempt = {
      attemptNumber,
      timestamp: new Date().toISOString(),
      httpStatus,
      durationMs,
    };

    const updatedAttempts = [...record.attempts, deliveryAttempt];

    await updateRecord(record.id, {
      attemptCount: attemptNumber,
      attempts: updatedAttempts,
    });

    logger.info('webhook.attempt', {
      requestId: randomUUID(),
      deliveryId: record.id,
      attemptNumber,
      destinationUrl: record.destinationUrl,
      httpStatus,
      durationMs,
      success,
      retryable,
    });

    return { success, retryable, httpStatus, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    errorType = isTimeoutError(err) ? 'TIMEOUT' : 'NETWORK_ERROR';
    retryable = true;

    const deliveryAttempt: DeliveryAttempt = {
      attemptNumber,
      timestamp: new Date().toISOString(),
      errorType,
      durationMs,
    };

    const updatedAttempts = [...record.attempts, deliveryAttempt];

    await updateRecord(record.id, {
      attemptCount: attemptNumber,
      attempts: updatedAttempts,
    });

    logger.info('webhook.attempt', {
      requestId: randomUUID(),
      deliveryId: record.id,
      attemptNumber,
      destinationUrl: record.destinationUrl,
      errorType,
      durationMs,
      success: false,
      retryable: true,
      error: err instanceof Error ? err.message : String(err),
    });

    return { success: false, retryable: true, errorType, durationMs };
  }
}

/**
 * Mark a record as successfully delivered.
 */
export async function markDelivered(recordId: string, attemptCount: number): Promise<void> {
  await updateRecord(recordId, {
    status: 'delivered',
    attemptCount,
    nextAttemptAt: null,
  });

  logger.info('webhook.delivered', {
    requestId: randomUUID(),
    deliveryId: recordId,
    attemptCount,
  });
}

/**
 * Mark a record as permanently failed, write to DLQ, and send failure notification.
 */
export async function markFailed(record: DeliveryRecord): Promise<void> {
  await updateRecord(record.id, {
    status: 'failed',
    nextAttemptAt: null,
  });

  logger.info('webhook.failed', {
    requestId: randomUUID(),
    deliveryId: record.id,
    destinationUrl: record.destinationUrl,
    attemptCount: record.attemptCount,
  });

  // Write to DLQ and send failure notification
  try {
    const { write } = await import('./dlq');
    const { notify } = await import('./alert-service');
    const dlqEntry = await write(record);
    await notify(dlqEntry);
  } catch (err) {
    logger.error('Failed to write DLQ entry or send alert', {
      deliveryId: record.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('timed out') || err.name === 'AbortError';
  }
  return false;
}
