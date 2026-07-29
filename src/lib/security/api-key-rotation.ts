import { pool } from '../db/client';
import { rotateApiKey, getApiKeyById } from '../api-keys/service';
import { logger } from '../logger';
import type { ApiKeyRecord } from '../api-keys/types';

/**
 * Configuration for API key rotation
 */
export interface RotationConfig {
  // Rotation interval in milliseconds (default: 90 days)
  rotationIntervalMs: number;
  // Grace period for old keys in milliseconds (default: 7 days)
  gracePeriodMs: number;
  // Enable automatic rotation
  enableAutoRotation: boolean;
  // Notification email for rotation events
  notificationEmail?: string;
}

const DEFAULT_CONFIG: RotationConfig = {
  rotationIntervalMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  gracePeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  enableAutoRotation: true,
};

/**
 * Get keys that need rotation
 */
export async function getKeysNeedingRotation(
  config: RotationConfig = DEFAULT_CONFIG,
): Promise<ApiKeyRecord[]> {
  const rotationThreshold = Date.now() - config.rotationIntervalMs;

  const result = await pool.query(
    `
      SELECT *
      FROM api_keys
      WHERE status = 'active'
        AND (last_rotated_at IS NULL OR last_rotated_at < $1)
        AND (expires_at IS NULL OR expires_at > $2)
      ORDER BY last_rotated_at ASC NULLS FIRST
    `,
    [rotationThreshold, Date.now()],
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    status: row.status as ApiKeyRecord['status'],
    scopes: JSON.parse(row.scopes as string),
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
  }));
}

/**
 * Get keys in grace period (rotated but still valid)
 */
export async function getKeysInGracePeriod(
  config: RotationConfig = DEFAULT_CONFIG,
): Promise<ApiKeyRecord[]> {
  const gracePeriodThreshold = Date.now() - config.gracePeriodMs;

  const result = await pool.query(
    `
      SELECT *
      FROM api_keys
      WHERE status = 'rotated'
        AND last_rotated_at > $1
      ORDER BY last_rotated_at DESC
    `,
    [gracePeriodThreshold],
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    status: row.status as ApiKeyRecord['status'],
    scopes: JSON.parse(row.scopes as string),
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
  }));
}

/**
 * Perform automatic key rotation
 */
export async function performAutoRotation(config: RotationConfig = DEFAULT_CONFIG): Promise<{
  rotatedCount: number;
  failedCount: number;
  errors: Array<{ keyId: string; error: string }>;
}> {
  if (!config.enableAutoRotation) {
    return { rotatedCount: 0, failedCount: 0, errors: [] };
  }

  const keysToRotate = await getKeysNeedingRotation(config);
  const errors: Array<{ keyId: string; error: string }> = [];
  let rotatedCount = 0;
  let failedCount = 0;

  for (const key of keysToRotate) {
    try {
      const rotated = await rotateApiKey(key.id);
      if (rotated) {
        rotatedCount++;
        logger.info('api_key_rotated', {
          keyId: key.id,
          keyName: key.name,
          newKeyId: rotated.id,
        });
      } else {
        failedCount++;
        errors.push({ keyId: key.id, error: 'Failed to rotate key' });
      }
    } catch (error) {
      failedCount++;
      errors.push({
        keyId: key.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      logger.error('api_key_rotation_failed', {
        keyId: key.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { rotatedCount, failedCount, errors };
}

/**
 * Revoke keys that have exceeded grace period
 */
export async function revokeExpiredRotatedKeys(config: RotationConfig = DEFAULT_CONFIG): Promise<{
  revokedCount: number;
  errors: Array<{ keyId: string; error: string }>;
}> {
  const gracePeriodThreshold = Date.now() - config.gracePeriodMs;

  const result = await pool.query(
    `
      SELECT id, name
      FROM api_keys
      WHERE status = 'rotated'
        AND last_rotated_at < $1
    `,
    [gracePeriodThreshold],
  );

  const errors: Array<{ keyId: string; error: string }> = [];
  let revokedCount = 0;

  for (const row of result.rows) {
    try {
      await pool.query(
        `
          UPDATE api_keys
          SET status = 'revoked',
              revoked_at = $2,
              revoked_reason = 'Grace period expired',
              updated_at = $2
          WHERE id = $1
        `,
        [row.id as string, Date.now()],
      );
      revokedCount++;
      logger.info('api_key_grace_period_expired', {
        keyId: row.id,
        keyName: row.name,
      });
    } catch (error) {
      errors.push({
        keyId: row.id as string,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      logger.error('api_key_grace_period_revocation_failed', {
        keyId: row.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { revokedCount, errors };
}

/**
 * Get rotation status for a key
 */
export async function getRotationStatus(keyId: string): Promise<{
  keyId: string;
  needsRotation: boolean;
  daysUntilRotation: number;
  inGracePeriod: boolean;
  daysUntilRevocation: number;
} | null> {
  const key = await getApiKeyById(keyId);
  if (!key) return null;

  const config = DEFAULT_CONFIG;
  const lastRotatedAt = key.lastRotatedAt ?? key.createdAt;
  const daysSinceRotation = (Date.now() - lastRotatedAt) / (24 * 60 * 60 * 1000);
  const daysUntilRotation = Math.max(
    0,
    config.rotationIntervalMs / (24 * 60 * 60 * 1000) - daysSinceRotation,
  );

  const inGracePeriod = key.status === 'rotated';
  const daysUntilRevocation = inGracePeriod
    ? Math.max(
        0,
        config.gracePeriodMs / (24 * 60 * 60 * 1000) -
          (Date.now() - (key.lastRotatedAt ?? 0)) / (24 * 60 * 60 * 1000),
      )
    : 0;

  return {
    keyId,
    needsRotation: daysUntilRotation <= 0,
    daysUntilRotation,
    inGracePeriod,
    daysUntilRevocation,
  };
}
