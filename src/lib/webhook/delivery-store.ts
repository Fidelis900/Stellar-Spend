import { randomUUID } from 'crypto';
import { pool } from '../db/client';
import type { DeliveryRecord, DeliveryStatus, DeliveryAttempt, WebhookPayload } from './types';

export class DeliveryStoreError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'DeliveryStoreError';
  }
}

/** Creates the delivery_records table if it does not already exist. */
export async function createTable(): Promise<void> {
  const sql = `
        CREATE TABLE IF NOT EXISTS delivery_records (
            id TEXT PRIMARY KEY,
            destination_url TEXT NOT NULL,
            payload JSONB NOT NULL,
            status TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            attempts JSONB NOT NULL DEFAULT '[]',
            next_attempt_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `;
  try {
    await pool.query(sql);
  } catch (err) {
    throw new DeliveryStoreError('Failed to create delivery_records table', err);
  }
}

function rowToRecord(row: Record<string, unknown>): DeliveryRecord {
  return {
    id: row.id as string,
    destinationUrl: row.destination_url as string,
    payload: row.payload as WebhookPayload,
    status: row.status as DeliveryStatus,
    attemptCount: row.attempt_count as number,
    maxAttempts: row.max_attempts as number,
    attempts: (row.attempts as DeliveryAttempt[]) ?? [],
    nextAttemptAt: row.next_attempt_at ? (row.next_attempt_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/** Create a new DeliveryRecord with a generated UUID id. */
export async function createRecord(
  destinationUrl: string,
  payload: WebhookPayload,
  maxAttempts = 5,
): Promise<DeliveryRecord> {
  const id = randomUUID();
  const sql = `
        INSERT INTO delivery_records
            (id, destination_url, payload, status, attempt_count, max_attempts, attempts, next_attempt_at)
        VALUES ($1, $2, $3, 'pending', 0, $4, '[]', NOW())
        RETURNING *
    `;
  try {
    const result = await pool.query(sql, [
      id,
      destinationUrl,
      JSON.stringify(payload),
      maxAttempts,
    ]);
    return rowToRecord(result.rows[0]);
  } catch (err) {
    throw new DeliveryStoreError('Failed to create delivery record', err);
  }
}

/** Retrieve a single DeliveryRecord by id. Returns null if not found. */
export async function getRecord(id: string): Promise<DeliveryRecord | null> {
  const sql = `SELECT * FROM delivery_records WHERE id = $1`;
  try {
    const result = await pool.query(sql, [id]);
    if (result.rows.length === 0) return null;
    return rowToRecord(result.rows[0]);
  } catch (err) {
    throw new DeliveryStoreError(`Failed to get delivery record ${id}`, err);
  }
}

/** Update fields on an existing DeliveryRecord. updated_at is always refreshed. */
export async function updateRecord(
  id: string,
  updates: Partial<Pick<DeliveryRecord, 'status' | 'attemptCount' | 'attempts' | 'nextAttemptAt'>>,
): Promise<DeliveryRecord> {
  const columnMap: Record<string, string> = {
    status: 'status',
    attemptCount: 'attempt_count',
    attempts: 'attempts',
    nextAttemptAt: 'next_attempt_at',
  };

  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (key in columnMap) {
      const dbValue = key === 'attempts' ? JSON.stringify(value) : (value ?? null);
      setClauses.push(`${columnMap[key]} = $${paramIndex++}`);
      values.push(dbValue);
    }
  }

  values.push(id);
  const sql = `UPDATE delivery_records SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  try {
    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      throw new DeliveryStoreError(`Delivery record ${id} not found`, null);
    }
    return rowToRecord(result.rows[0]);
  } catch (err) {
    if (err instanceof DeliveryStoreError) throw err;
    throw new DeliveryStoreError(`Failed to update delivery record ${id}`, err);
  }
}

/**
 * Query records that are due for retry:
 * status = 'pending' AND next_attempt_at <= NOW()
 */
export async function getDueRecords(): Promise<DeliveryRecord[]> {
  const sql = `
        SELECT * FROM delivery_records
        WHERE status = 'pending' AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC
    `;
  try {
    const result = await pool.query(sql);
    return result.rows.map(rowToRecord);
  } catch (err) {
    throw new DeliveryStoreError('Failed to query due delivery records', err);
  }
}

/** List all records with a given status. */
export async function getRecordsByStatus(status: DeliveryStatus): Promise<DeliveryRecord[]> {
  const sql = `SELECT * FROM delivery_records WHERE status = $1 ORDER BY created_at DESC`;
  try {
    const result = await pool.query(sql, [status]);
    return result.rows.map(rowToRecord);
  } catch (err) {
    throw new DeliveryStoreError(`Failed to query delivery records with status ${status}`, err);
  }
}
