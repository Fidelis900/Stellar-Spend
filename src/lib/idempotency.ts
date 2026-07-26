import { logger } from '@/lib/logger';
import { createHash } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db/client';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_STATUS_HEADER = 'Idempotency-Status';

type IdempotencyRecordStatus = 'processing' | 'completed';

interface StoredIdempotencyRecord {
  idempotency_key: string;
  method: string;
  path: string;
  request_hash: string;
  status: IdempotencyRecordStatus;
  status_code: number | null;
  response_body: unknown;
  response_headers: Record<string, string> | null;
  locked_until: number | null;
  expires_at: number;
}

interface BeginIdempotencyResult {
  kind: 'started' | 'replay' | 'conflict' | 'in_progress';
  replayResponse?: NextResponse;
  statusCode?: number;
}

export interface IdempotencyOptions {
  ttlMs?: number;
  lockTtlMs?: number;
  /** When true, requests missing the Idempotency-Key header are rejected with 400 instead of bypassing idempotency checks. */
  required?: boolean;
}

function buildMissingKeyResponse(): NextResponse {
  return NextResponse.json(
    { error: `${IDEMPOTENCY_KEY_HEADER} header is required for this request` },
    { status: 400 }
  );
}

function getConfig() {
  const ttlMs = Number.parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '', 10);
  const lockTtlMs = Number.parseInt(process.env.IDEMPOTENCY_LOCK_TTL_MS ?? '', 10);

  return {
    ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS,
    lockTtlMs: Number.isFinite(lockTtlMs) && lockTtlMs > 0 ? lockTtlMs : DEFAULT_LOCK_TTL_MS,
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalize(val)}`).join(',')}}`;
}

export function buildRequestHash(method: string, path: string, bodyText: string): string {
  let normalizedBody = bodyText;

  try {
    normalizedBody = canonicalize(JSON.parse(bodyText || 'null'));
  } catch {
    normalizedBody = bodyText;
  }

  return createHash('sha256')
    .update(`${method.toUpperCase()}:${path}:${normalizedBody}`)
    .digest('hex');
}

function normalizeHeaderMap(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function readResponseBody(response: NextResponse): Promise<unknown> {
  const text = await response.clone().text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toNextResponse(
  body: unknown,
  status: number,
  headers?: Record<string, string> | null
): NextResponse {
  const response =
    typeof body === 'string'
      ? new NextResponse(body, { status })
      : NextResponse.json(body, { status });

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === 'content-length') continue;
    response.headers.set(key, value);
  }

  return response;
}

async function fetchRecordForUpdate(
  client: PoolClient,
  idempotencyKey: string,
  method: string,
  path: string
): Promise<StoredIdempotencyRecord | null> {
  const result = await client.query<StoredIdempotencyRecord>(
    `
      SELECT *
      FROM idempotency_keys
      WHERE idempotency_key = $1
        AND method = $2
        AND path = $3
      FOR UPDATE
    `,
    [idempotencyKey, method, path]
  );

  return result.rows[0] ?? null;
}

async function beginIdempotency(
  idempotencyKey: string,
  method: string,
  path: string,
  requestHash: string,
  ttlMs: number,
  lockTtlMs: number
): Promise<BeginIdempotencyResult> {
  const now = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM idempotency_keys WHERE expires_at <= $1', [now]);

    const existing = await fetchRecordForUpdate(client, idempotencyKey, method, path);

    if (!existing) {
      await client.query(
        `
          INSERT INTO idempotency_keys (
            idempotency_key, method, path, request_hash, status,
            locked_until, created_at, updated_at, expires_at
          ) VALUES ($1, $2, $3, $4, 'processing', $5, $6, $6, $7)
        `,
        [idempotencyKey, method, path, requestHash, now + lockTtlMs, now, now + ttlMs]
      );
      await client.query('COMMIT');
      return { kind: 'started' };
    }

    if (existing.request_hash !== requestHash) {
      await client.query('ROLLBACK');
      return { kind: 'conflict', statusCode: 409 };
    }

    if (existing.status === 'completed' && existing.status_code) {
      await client.query('COMMIT');
      const replayResponse = toNextResponse(
        existing.response_body,
        existing.status_code,
        existing.response_headers
      );
      replayResponse.headers.set(IDEMPOTENCY_STATUS_HEADER, 'replayed');
      replayResponse.headers.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey);
      return { kind: 'replay', replayResponse };
    }

    if (existing.status === 'processing' && (existing.locked_until ?? 0) > now) {
      await client.query('ROLLBACK');
      return { kind: 'in_progress', statusCode: 409 };
    }

    await client.query(
      `
        UPDATE idempotency_keys
        SET status = 'processing',
            request_hash = $4,
            status_code = NULL,
            response_body = NULL,
            response_headers = NULL,
            locked_until = $5,
            updated_at = $6,
            expires_at = $7
        WHERE idempotency_key = $1
          AND method = $2
          AND path = $3
      `,
      [idempotencyKey, method, path, requestHash, now + lockTtlMs, now, now + ttlMs]
    );

    await client.query('COMMIT');
    return { kind: 'started' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function persistCompletedResponse(
  idempotencyKey: string,
  method: string,
  path: string,
  response: NextResponse,
  ttlMs: number
): Promise<void> {
  if (response.status >= 500) {
    await pool.query(
      `
        DELETE FROM idempotency_keys
        WHERE idempotency_key = $1
          AND method = $2
          AND path = $3
      `,
      [idempotencyKey, method, path]
    );
    return;
  }

  const now = Date.now();
  const body = await readResponseBody(response);
  const headers = normalizeHeaderMap(response.headers);

  await pool.query(
    `
      UPDATE idempotency_keys
      SET status = 'completed',
          status_code = $4,
          response_body = $5::jsonb,
          response_headers = $6::jsonb,
          locked_until = NULL,
          updated_at = $7,
          expires_at = $8
      WHERE idempotency_key = $1
        AND method = $2
        AND path = $3
    `,
    [idempotencyKey, method, path, response.status, JSON.stringify(body), JSON.stringify(headers), now, now + ttlMs]
  );
}

async function clearIdempotencyRecord(
  idempotencyKey: string,
  method: string,
  path: string
): Promise<void> {
  await pool.query(
    `
      DELETE FROM idempotency_keys
      WHERE idempotency_key = $1
        AND method = $2
        AND path = $3
    `,
    [idempotencyKey, method, path]
  );
}

function buildConflictResponse(message: string, idempotencyKey: string): NextResponse {
  const response = NextResponse.json({ error: message }, { status: 409 });
  response.headers.set(IDEMPOTENCY_STATUS_HEADER, 'conflict');
  response.headers.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey);
  return response;
}

export async function withIdempotency(
  request: NextRequest,
  handler: () => Promise<NextResponse>,
  options?: IdempotencyOptions
): Promise<NextResponse> {
  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!idempotencyKey) {
    if (options?.required) {
      return buildMissingKeyResponse();
    }
    return handler();
  }

  const config = getConfig();
  const ttlMs = options?.ttlMs ?? config.ttlMs;
  const lockTtlMs = options?.lockTtlMs ?? config.lockTtlMs;
  const bodyText = await request.clone().text();
  const requestHash = buildRequestHash(request.method, request.nextUrl.pathname, bodyText);

  const beginResult = await beginIdempotency(
    idempotencyKey,
    request.method.toUpperCase(),
    request.nextUrl.pathname,
    requestHash,
    ttlMs,
    lockTtlMs
  );

  if (beginResult.kind === 'replay' && beginResult.replayResponse) {
    return beginResult.replayResponse;
  }

  if (beginResult.kind === 'conflict') {
    return buildConflictResponse(
      'Idempotency key has already been used with a different request payload',
      idempotencyKey
    );
  }

  if (beginResult.kind === 'in_progress') {
    return buildConflictResponse(
      'A request with this idempotency key is already being processed',
      idempotencyKey
    );
  }

  const response = await handler();
  response.headers.set(IDEMPOTENCY_STATUS_HEADER, 'created');
  response.headers.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey);

  try {
    await persistCompletedResponse(
      idempotencyKey,
      request.method.toUpperCase(),
      request.nextUrl.pathname,
      response,
      ttlMs
    );
  } catch (error) {
    logger.error('Failed to persist idempotency result:', {}, error);
    try {
      await clearIdempotencyRecord(
        idempotencyKey,
        request.method.toUpperCase(),
        request.nextUrl.pathname
      );
    } catch (cleanupError) {
      logger.error('Failed to clear idempotency record after persistence error:', {}, cleanupError);
    }
  }

  return response;
}
