import { logger } from '@/lib/logger';
import type { DLQEntry } from './types';
import { getWebhookConfig } from './config';

export interface AlertPayload {
  deliveryId: string;
  destinationUrl: string;
  totalAttempts: number;
  lastError: string;
  finalFailureTime: string;
}

interface AggregatedWindow {
  payload: AlertPayload;
  windowStart: number; // ms timestamp
}

// In-memory map: destinationUrl -> aggregated window
const alertWindows = new Map<string, AggregatedWindow>();

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function buildPayload(entry: DLQEntry): AlertPayload {
  return {
    deliveryId: entry.deliveryId,
    destinationUrl: entry.destinationUrl,
    totalAttempts: entry.attempts.length,
    lastError: entry.finalError,
    finalFailureTime: entry.addedAt,
  };
}

async function sendAlert(payload: AlertPayload): Promise<void> {
  const config = getWebhookConfig();
  const url = config.alertChannelUrl;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Alert endpoint responded with HTTP ${response.status}`);
    }
  } catch (err) {
    logger.error('Failed to deliver webhook alert', {
      alert: JSON.stringify(payload),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Aggregate failures per destinationUrl within a 5-minute window.
 * Only one alert is sent per URL per window.
 */
export async function notify(entry: DLQEntry): Promise<void> {
  const now = Date.now();
  const existing = alertWindows.get(entry.destinationUrl);

  if (existing && now - existing.windowStart < WINDOW_MS) {
    // Within the suppression window — update the aggregated payload but don't re-send
    existing.payload = buildPayload(entry);
    return;
  }

  // New window: record it and send immediately
  const payload = buildPayload(entry);
  alertWindows.set(entry.destinationUrl, { payload, windowStart: now });
  await sendAlert(payload);
}

/**
 * Flush any pending aggregated alerts immediately, regardless of window state.
 * Clears the in-memory map after sending.
 */
export async function flush(): Promise<void> {
  const entries = Array.from(alertWindows.values());
  alertWindows.clear();

  await Promise.all(entries.map((w) => sendAlert(w.payload)));
}
