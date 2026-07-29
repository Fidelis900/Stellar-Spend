import { randomUUID } from 'crypto';
import { pool } from '../db/client';
import type { WebhookDeliveryLog } from './subscription-types';
import type { DeliveryStatus } from './types';

export class DeliveryLogError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DeliveryLogError';
  }
}

export async function createTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload_url TEXT NOT NULL,
      request_body TEXT NOT NULL,
      response_status INTEGER,
      response_body TEXT,
      duration_ms BIGINT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL
    )
  `;
  try {
    await pool.query(sql);
  } catch (err) {
    throw new DeliveryLogError('Failed to create webhook_delivery_logs table', err);
  }
}

export async function logDelivery(
  entry: Omit<WebhookDeliveryLog, 'id' | 'createdAt'>,
): Promise<WebhookDeliveryLog> {
  const id = randomUUID();
  const now = Date.now();
  const sql = `
    INSERT INTO webhook_delivery_logs
      (id, subscription_id, event, payload_url, request_body, response_status, response_body, duration_ms, status, attempt_count, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  try {
    const result = await pool.query(sql, [
      id,
      entry.subscriptionId,
      entry.event,
      entry.payloadUrl,
      entry.requestBody,
      entry.responseStatus,
      entry.responseBody,
      entry.durationMs,
      entry.status,
      entry.attemptCount,
      now,
    ]);
    return rowToDeliveryLog(result.rows[0]);
  } catch (err) {
    throw new DeliveryLogError('Failed to log delivery', err);
  }
}

function rowToDeliveryLog(row: Record<string, unknown>): WebhookDeliveryLog {
  return {
    id: row.id as string,
    subscriptionId: row.subscription_id as string,
    event: row.event as WebhookDeliveryLog['event'],
    payloadUrl: row.payload_url as string,
    requestBody: row.request_body as string,
    responseStatus: row.response_status as number | null,
    responseBody: row.response_body as string | null,
    durationMs: Number(row.duration_ms),
    status: row.status as DeliveryStatus,
    attemptCount: Number(row.attempt_count),
    createdAt: Number(row.created_at),
  };
}

export async function getDeliveryLogs(
  subscriptionId?: string,
  limit = 50,
  offset = 0,
): Promise<WebhookDeliveryLog[]> {
  let sql = `SELECT * FROM webhook_delivery_logs`;
  const params: unknown[] = [];

  if (subscriptionId) {
    sql += ` WHERE subscription_id = $1`;
    params.push(subscriptionId);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  try {
    const result = await pool.query(sql, params);
    return result.rows.map(rowToDeliveryLog);
  } catch (err) {
    throw new DeliveryLogError('Failed to get delivery logs', err);
  }
}

export async function getDeliveryLogById(id: string): Promise<WebhookDeliveryLog | null> {
  const sql = `SELECT * FROM webhook_delivery_logs WHERE id = $1`;
  try {
    const result = await pool.query(sql, [id]);
    return result.rows[0] ? rowToDeliveryLog(result.rows[0]) : null;
  } catch (err) {
    throw new DeliveryLogError(`Failed to get delivery log ${id}`, err);
  }
}
