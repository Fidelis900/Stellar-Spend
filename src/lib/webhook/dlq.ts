import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';
import { pool } from '../db/client';
import { createRecord } from './delivery-store';
import type { DeliveryRecord, DLQEntry, WebhookPayload, DeliveryAttempt } from './types';

export class DLQError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'DLQError';
  }
}

/** Creates the dlq_entries table if it does not already exist. */
export async function createTable(): Promise<void> {
  const sql = `
        CREATE TABLE IF NOT EXISTS dlq_entries (
            id TEXT PRIMARY KEY,
            delivery_id TEXT NOT NULL,
            destination_url TEXT NOT NULL,
            payload JSONB NOT NULL,
            attempts JSONB NOT NULL,
            final_error TEXT NOT NULL,
            added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        )
    `;
  try {
    await pool.query(sql);
  } catch (err) {
    throw new DLQError('Failed to create dlq_entries table', err);
  }
}

function rowToEntry(row: Record<string, unknown>): DLQEntry {
  return {
    id: row.id as string,
    deliveryId: row.delivery_id as string,
    destinationUrl: row.destination_url as string,
    payload: row.payload as WebhookPayload,
    attempts: (row.attempts as DeliveryAttempt[]) ?? [],
    finalError: row.final_error as string,
    addedAt: (row.added_at as Date).toISOString(),
    expiresAt: (row.expires_at as Date).toISOString(),
  };
}

/**
 * Write a failed DeliveryRecord to the DLQ.
 * expiresAt is set to addedAt + 30 days.
 * If the write fails, the full DeliveryRecord is logged at error severity.
 */
export async function write(record: DeliveryRecord): Promise<DLQEntry> {
  const id = randomUUID();
  const finalError =
    record.attempts.length > 0
      ? (record.attempts[record.attempts.length - 1].errorType ?? 'UNKNOWN_ERROR')
      : 'UNKNOWN_ERROR';

  const sql = `
        INSERT INTO dlq_entries
            (id, delivery_id, destination_url, payload, attempts, final_error, added_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '30 days')
        RETURNING *
    `;
  try {
    const result = await pool.query(sql, [
      id,
      record.id,
      record.destinationUrl,
      JSON.stringify(record.payload),
      JSON.stringify(record.attempts),
      finalError,
    ]);
    return rowToEntry(result.rows[0]);
  } catch (err) {
    logger.error('Failed to write DLQ entry', { record: JSON.stringify(record), error: err });
    throw new DLQError('Failed to write DLQ entry', err);
  }
}

/** Retrieve a DLQ entry by delivery ID. Returns null if not found. */
export async function get(deliveryId: string): Promise<DLQEntry | null> {
  const sql = `SELECT * FROM dlq_entries WHERE delivery_id = $1`;
  try {
    const result = await pool.query(sql, [deliveryId]);
    if (result.rows.length === 0) return null;
    return rowToEntry(result.rows[0]);
  } catch (err) {
    throw new DLQError(`Failed to get DLQ entry for delivery ${deliveryId}`, err);
  }
}

/**
 * Replay a DLQ entry: creates a new DeliveryRecord with attemptCount = 0,
 * status = 'pending', and a new UUID id.
 */
export async function replay(entryId: string): Promise<DeliveryRecord> {
  const sql = `SELECT * FROM dlq_entries WHERE id = $1`;
  let entry: DLQEntry;
  try {
    const result = await pool.query(sql, [entryId]);
    if (result.rows.length === 0) {
      throw new DLQError(`DLQ entry ${entryId} not found`, null);
    }
    entry = rowToEntry(result.rows[0]);
  } catch (err) {
    if (err instanceof DLQError) throw err;
    throw new DLQError(`Failed to fetch DLQ entry ${entryId}`, err);
  }

  return createRecord(entry.destinationUrl, entry.payload);
}

/** List DLQ entries, optionally filtered by destinationUrl and/or since date. */
export async function list(filter?: {
  destinationUrl?: string;
  since?: Date;
}): Promise<DLQEntry[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filter?.destinationUrl) {
    conditions.push(`destination_url = $${paramIndex++}`);
    values.push(filter.destinationUrl);
  }
  if (filter?.since) {
    conditions.push(`added_at >= $${paramIndex++}`);
    values.push(filter.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM dlq_entries ${where} ORDER BY added_at DESC`;

  try {
    const result = await pool.query(sql, values);
    return result.rows.map(rowToEntry);
  } catch (err) {
    throw new DLQError('Failed to list DLQ entries', err);
  }
}
