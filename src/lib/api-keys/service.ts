import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { pool } from '@/lib/db';
import type {
  ApiKeyAnalytics,
  ApiKeyRecord,
  ApiKeyScope,
  ApiKeyUsageEvent,
  ApiKeyWithSecret,
} from '@/lib/api-keys/types';

class PerKeyRateLimiter {
  private readonly store = new Map<string, { count: number; resetTime: number }>();

  check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now >= record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true };
    }

    record.count += 1;
    if (record.count > maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      };
    }

    return { allowed: true };
  }
}

const perKeyRateLimiter = new PerKeyRateLimiter();
const API_KEY_PREFIX = 'ssp_live_';

function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mapApiKey(row: Record<string, unknown>): ApiKeyRecord {
  const rawScopes = row.scopes;
  const scopes: ApiKeyScope[] = Array.isArray(rawScopes)
    ? (rawScopes as ApiKeyScope[])
    : typeof rawScopes === 'string' && rawScopes
      ? (JSON.parse(rawScopes) as ApiKeyScope[])
      : [];

  return {
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    status: row.status as ApiKeyRecord['status'],
    scopes,
    rateLimitMaxRequests: Number(row.rate_limit_max_requests),
    rateLimitWindowMs: Number(row.rate_limit_window_ms),
    usageCount: Number(row.usage_count),
    lastUsedAt: row.last_used_at ? Number(row.last_used_at) : undefined,
    lastRotatedAt: row.last_rotated_at ? Number(row.last_rotated_at) : undefined,
    revokedAt: row.revoked_at ? Number(row.revoked_at) : undefined,
    revokedReason: (row.revoked_reason as string | null) ?? undefined,
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
    rotatedFromKeyId: (row.rotated_from_key_id as string | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapUsageEvent(row: Record<string, unknown>): ApiKeyUsageEvent {
  return {
    id: row.id as string,
    apiKeyId: row.api_key_id as string,
    method: row.method as string,
    path: row.path as string,
    statusCode: Number(row.status_code),
    limited: Boolean(row.limited),
    ipAddress: (row.ip_address as string | null) ?? undefined,
    usedAt: Number(row.used_at),
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  };
}

function generatePlaintextKey(): { plaintextKey: string; keyPrefix: string } {
  const publicPrefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  return {
    plaintextKey: `${API_KEY_PREFIX}${publicPrefix}.${secret}`,
    keyPrefix: publicPrefix,
  };
}

function getAdminToken(): string | undefined {
  const token = process.env.API_KEY_ADMIN_TOKEN;
  return token && token.trim() ? token.trim() : undefined;
}

export function hasApiKeyAdminToken(): boolean {
  return Boolean(getAdminToken());
}

export function isValidAdminToken(token: string | null): boolean {
  const expected = getAdminToken();
  if (!expected || !token) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(token);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function createApiKey(input: {
  name: string;
  scopes?: ApiKeyScope[];
  rateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
  expiresAt?: number;
  rotatedFromKeyId?: string;
}): Promise<ApiKeyWithSecret> {
  const now = Date.now();
  const id = randomUUID();
  const generated = generatePlaintextKey();
  const keyHash = hashApiKey(generated.plaintextKey);

  const rateLimitMaxRequests = input.rateLimitMaxRequests ?? 60;
  const rateLimitWindowMs = input.rateLimitWindowMs ?? 60_000;
  const scopes = input.scopes ?? ['transactions:read'];

  const result = await pool.query(
    `
      INSERT INTO api_keys (
        id, name, key_prefix, key_hash, status,
        scopes, rate_limit_max_requests, rate_limit_window_ms,
        expires_at, rotated_from_key_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'active', $5::jsonb, $6, $7, $8, $9, $10, $10)
      RETURNING *
    `,
    [
      id,
      input.name,
      generated.keyPrefix,
      keyHash,
      JSON.stringify(scopes),
      rateLimitMaxRequests,
      rateLimitWindowMs,
      input.expiresAt ?? null,
      input.rotatedFromKeyId ?? null,
      now,
    ],
  );

  return {
    ...mapApiKey(result.rows[0]),
    plaintextKey: generated.plaintextKey,
  };
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const result = await pool.query(
    `
      SELECT *
      FROM api_keys
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapApiKey(row));
}

export async function getApiKeyById(id: string): Promise<ApiKeyRecord | null> {
  const result = await pool.query(`SELECT * FROM api_keys WHERE id = $1`, [id]);
  return result.rows[0] ? mapApiKey(result.rows[0]) : null;
}

export async function revokeApiKey(id: string, reason?: string): Promise<ApiKeyRecord | null> {
  const now = Date.now();
  const result = await pool.query(
    `
      UPDATE api_keys
      SET status = 'revoked',
          revoked_at = COALESCE(revoked_at, $2),
          revoked_reason = COALESCE($3, revoked_reason),
          updated_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [id, now, reason ?? null],
  );

  return result.rows[0] ? mapApiKey(result.rows[0]) : null;
}

export async function rotateApiKey(id: string): Promise<ApiKeyWithSecret | null> {
  const existing = await getApiKeyById(id);
  if (!existing) return null;

  const rotated = await createApiKey({
    name: `${existing.name} (rotated)`,
    scopes: existing.scopes,
    rateLimitMaxRequests: existing.rateLimitMaxRequests,
    rateLimitWindowMs: existing.rateLimitWindowMs,
    expiresAt: existing.expiresAt,
    rotatedFromKeyId: existing.id,
  });

  await pool.query(
    `
      UPDATE api_keys
      SET status = 'rotated',
          last_rotated_at = $2,
          updated_at = $2
      WHERE id = $1
    `,
    [id, Date.now()],
  );

  return rotated;
}

export async function authenticateApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(rawKey);
  const result = await pool.query(
    `
      SELECT *
      FROM api_keys
      WHERE key_hash = $1
      LIMIT 1
    `,
    [keyHash],
  );

  if (!result.rows[0]) return null;
  const apiKey = mapApiKey(result.rows[0]);

  if (apiKey.status !== 'active') return null;
  if (apiKey.expiresAt && apiKey.expiresAt <= Date.now()) return null;
  return apiKey;
}

export function checkApiKeyRateLimit(apiKey: ApiKeyRecord): {
  allowed: boolean;
  retryAfter?: number;
} {
  return perKeyRateLimiter.check(apiKey.id, apiKey.rateLimitMaxRequests, apiKey.rateLimitWindowMs);
}

export async function recordApiKeyUsage(input: {
  apiKeyId: string;
  method: string;
  path: string;
  statusCode: number;
  limited: boolean;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = Date.now();
  await pool.query(
    `
      INSERT INTO api_key_usage_events (
        id, api_key_id, method, path, status_code, limited, ip_address, used_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      randomUUID(),
      input.apiKeyId,
      input.method,
      input.path,
      input.statusCode,
      input.limited,
      input.ipAddress ?? null,
      now,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  await pool.query(
    `
      UPDATE api_keys
      SET usage_count = usage_count + 1,
          last_used_at = $2,
          updated_at = $2
      WHERE id = $1
    `,
    [input.apiKeyId, now],
  );
}

export async function listApiKeyUsage(apiKeyId: string): Promise<ApiKeyUsageEvent[]> {
  const result = await pool.query(
    `
      SELECT *
      FROM api_key_usage_events
      WHERE api_key_id = $1
      ORDER BY used_at DESC
      LIMIT 100
    `,
    [apiKeyId],
  );

  return result.rows.map((row) => mapUsageEvent(row));
}

export async function getApiKeyAnalytics(apiKeyId: string): Promise<ApiKeyAnalytics | null> {
  const keyRecord = await getApiKeyById(apiKeyId);
  if (!keyRecord) return null;

  const [totalsResult, topPathsResult, byDayResult] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)                                        AS total_requests,
          COUNT(*) FILTER (WHERE status_code < 400)      AS success_requests,
          COUNT(*) FILTER (WHERE status_code >= 400)      AS error_requests,
          COUNT(*) FILTER (WHERE limited = TRUE)          AS rate_limited_requests,
          MIN(used_at)                                    AS first_used_at
        FROM api_key_usage_events
        WHERE api_key_id = $1
      `,
      [apiKeyId],
    ),
    pool.query(
      `
        SELECT path, COUNT(*) AS count
        FROM api_key_usage_events
        WHERE api_key_id = $1
        GROUP BY path
        ORDER BY count DESC
        LIMIT 10
      `,
      [apiKeyId],
    ),
    pool.query(
      `
        SELECT
          TO_CHAR(TO_TIMESTAMP(used_at / 1000), 'YYYY-MM-DD') AS date,
          COUNT(*) AS count
        FROM api_key_usage_events
        WHERE api_key_id = $1
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
      `,
      [apiKeyId],
    ),
  ]);

  const totals = totalsResult.rows[0];
  const totalRequests = Number(totals.total_requests);
  const successRequests = Number(totals.success_requests);
  const errorRequests = Number(totals.error_requests);
  const rateLimitedRequests = Number(totals.rate_limited_requests);

  const firstUsedAt = totals.first_used_at ? Number(totals.first_used_at) : null;
  const spanMs = firstUsedAt ? Date.now() - firstUsedAt : 0;
  const spanHours = spanMs > 0 ? spanMs / 3_600_000 : 1;
  const averageRequestsPerHour = totalRequests / spanHours;

  return {
    apiKeyId,
    totalRequests,
    successRequests,
    errorRequests,
    rateLimitedRequests,
    successRate: totalRequests > 0 ? successRequests / totalRequests : 0,
    topPaths: topPathsResult.rows.map((r) => ({ path: r.path as string, count: Number(r.count) })),
    requestsByDay: byDayResult.rows.map((r) => ({
      date: r.date as string,
      count: Number(r.count),
    })),
    averageRequestsPerHour,
  };
}

export function hasScope(apiKey: ApiKeyRecord, scope: ApiKeyScope): boolean {
  return apiKey.scopes.includes('admin') || apiKey.scopes.includes(scope);
}
