import { randomUUID, createHash } from 'crypto';
import { pool } from '../db/client';
import type { WebhookSubscription, WebhookEvent, SubscriptionStatus } from './subscription-types';
import { DEFAULT_SCHEMA_VERSION, isSupportedSchemaVersion, type SchemaVersion } from './schema-versions';

export class SubscriptionStoreError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SubscriptionStoreError';
  }
}

export function rowToSubscription(row: Record<string, unknown>): WebhookSubscription {
  return {
    id: row.id as string,
    endpointUrl: row.endpoint_url as string,
    signingSecret: row.signing_secret as string,
    events: JSON.parse(row.events as string) as WebhookEvent[],
    status: row.status as SubscriptionStatus,
    rateLimitMaxPerMinute: Number(row.rate_limit_max_per_minute),
    description: (row.description as string | null) ?? undefined,
    schemaVersion: (row.schema_version as SchemaVersion | null) ?? DEFAULT_SCHEMA_VERSION,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function createTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint_url TEXT NOT NULL,
      signing_secret TEXT NOT NULL,
      events JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      rate_limit_max_per_minute INTEGER NOT NULL DEFAULT 60,
      description TEXT,
      schema_version TEXT NOT NULL DEFAULT '${DEFAULT_SCHEMA_VERSION}',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `;
  try {
    await pool.query(sql);
  } catch (err) {
    throw new SubscriptionStoreError('Failed to create webhook_subscriptions table', err);
  }
}

export async function createSubscription(input: {
  endpointUrl: string;
  events: WebhookEvent[];
  signingSecret?: string;
  rateLimitMaxPerMinute?: number;
  description?: string;
  schemaVersion?: SchemaVersion;
}): Promise<WebhookSubscription> {
  const now = Date.now();
  const id = randomUUID();
  const signingSecret = input.signingSecret ?? randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const rateLimitMaxPerMinute = input.rateLimitMaxPerMinute ?? 60;
  const schemaVersion = input.schemaVersion && isSupportedSchemaVersion(input.schemaVersion)
    ? input.schemaVersion
    : DEFAULT_SCHEMA_VERSION;

  const sql = `
    INSERT INTO webhook_subscriptions
      (id, endpoint_url, signing_secret, events, status, rate_limit_max_per_minute, description, schema_version, created_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, 'active', $5, $6, $7, $8, $8)
    RETURNING *
  `;
  try {
    const result = await pool.query(sql, [
      id, input.endpointUrl, signingSecret,
      JSON.stringify(input.events), rateLimitMaxPerMinute,
      input.description ?? null, schemaVersion, now,
    ]);
    return rowToSubscription(result.rows[0]);
  } catch (err) {
    throw new SubscriptionStoreError('Failed to create subscription', err);
  }
}

export async function listSubscriptions(): Promise<WebhookSubscription[]> {
  const sql = `SELECT * FROM webhook_subscriptions ORDER BY created_at DESC`;
  try {
    const result = await pool.query(sql);
    return result.rows.map(rowToSubscription);
  } catch (err) {
    throw new SubscriptionStoreError('Failed to list subscriptions', err);
  }
}

export async function getSubscription(id: string): Promise<WebhookSubscription | null> {
  const sql = `SELECT * FROM webhook_subscriptions WHERE id = $1`;
  try {
    const result = await pool.query(sql, [id]);
    return result.rows[0] ? rowToSubscription(result.rows[0]) : null;
  } catch (err) {
    throw new SubscriptionStoreError(`Failed to get subscription ${id}`, err);
  }
}

export async function updateSubscription(
  id: string,
  updates: Partial<Pick<WebhookSubscription, 'endpointUrl' | 'events' | 'status' | 'rateLimitMaxPerMinute' | 'description' | 'schemaVersion'>>
): Promise<WebhookSubscription | null> {
  const setClauses: string[] = ['updated_at = $2'];
  const values: unknown[] = [];
  let paramIndex = 3;

  if (updates.endpointUrl !== undefined) {
    setClauses.push(`endpoint_url = $${paramIndex++}`);
    values.push(updates.endpointUrl);
  }
  if (updates.events !== undefined) {
    setClauses.push(`events = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(updates.events));
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.rateLimitMaxPerMinute !== undefined) {
    setClauses.push(`rate_limit_max_per_minute = $${paramIndex++}`);
    values.push(updates.rateLimitMaxPerMinute);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.schemaVersion !== undefined) {
    setClauses.push(`schema_version = $${paramIndex++}`);
    values.push(updates.schemaVersion);
  }

  values.unshift(Date.now(), id);
  const sql = `UPDATE webhook_subscriptions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;

  try {
    const result = await pool.query(sql, values);
    return result.rows[0] ? rowToSubscription(result.rows[0]) : null;
  } catch (err) {
    throw new SubscriptionStoreError(`Failed to update subscription ${id}`, err);
  }
}

export async function deleteSubscription(id: string): Promise<boolean> {
  try {
    const result = await pool.query(`DELETE FROM webhook_subscriptions WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    throw new SubscriptionStoreError(`Failed to delete subscription ${id}`, err);
  }
}

export async function getSubscriptionsByEvent(event: WebhookEvent): Promise<WebhookSubscription[]> {
  const sql = `
    SELECT * FROM webhook_subscriptions
    WHERE status = 'active' AND events @> $1::jsonb
    ORDER BY created_at ASC
  `;
  try {
    const result = await pool.query(sql, [JSON.stringify([event])]);
    return result.rows.map(rowToSubscription);
  } catch (err) {
    throw new SubscriptionStoreError(`Failed to get subscriptions for event ${event}`, err);
  }
}
