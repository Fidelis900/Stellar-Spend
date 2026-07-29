/**
 * Field-level encryption for repository PII columns — #692
 *
 * Provides transparent encrypt/decrypt so callers (repositories) never
 * work with plaintext PII directly.  Storage format:
 *
 *   <version>:<base64(iv + authTag + ciphertext)>
 *
 * Version "1" = AES-256-GCM with a key derived from ENCRYPTION_KEY env var.
 * This design allows future key versions (v2, v3…) without breaking existing
 * rows — the version prefix tells the decryptor which key to use.
 *
 * Key rotation:
 *   1. Set NEW_ENCRYPTION_KEY env var (keep old key as ENCRYPTION_KEY).
 *   2. Run `rotateFieldEncryption(rows, fields)` — re-encrypts each row
 *      in place using the new key, reading with the old key.
 *   3. Promote NEW_ENCRYPTION_KEY → ENCRYPTION_KEY and remove old key.
 *
 * PII fields encrypted in transactions:
 *   • beneficiary.accountIdentifier
 *   • beneficiary.accountName
 */

import * as crypto from 'crypto';
import { logger } from '../logger';

// ── Key derivation ────────────────────────────────────────────────────────────

const IV_BYTES = 16;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256
const CURRENT_VERSION = '1';

function deriveKey(rawKey: string): Buffer {
  if (rawKey.startsWith('0x')) {
    const buf = Buffer.from(rawKey.slice(2), 'hex');
    if (buf.length === KEY_BYTES) return buf;
  }
  // PBKDF2 for passphrase-style keys
  return crypto.pbkdf2Sync(rawKey, 'stellar-spend-field-enc', 100_000, KEY_BYTES, 'sha256');
}

function getKey(envVar: string = 'ENCRYPTION_KEY'): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${envVar} is not set — field encryption requires a key in production`);
    }
    // In test/dev environments fall back to a fixed test key so tests don't need env setup
    logger.warn('field_encryption.key_not_configured', {
      env: envVar,
      message: 'Using insecure default key. Set the env var before deploying.',
    });
    return Buffer.alloc(KEY_BYTES, 'test-only-key-not-for-production');
  }
  return deriveKey(raw);
}

// ── Core encrypt / decrypt ────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string.  Returns `"<version>:<base64>"`.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, enc]);
  return `${CURRENT_VERSION}:${combined.toString('base64')}`;
}

/**
 * Decrypt a value previously produced by `encryptField`.
 * Supports decrypting with the *new* key (for rotation previews) by passing `envVar`.
 */
export function decryptField(ciphertext: string, envVar: string = 'ENCRYPTION_KEY'): string {
  const colonIdx = ciphertext.indexOf(':');
  if (colonIdx === -1) throw new Error('Invalid encrypted field format — missing version prefix');

  const version = ciphertext.slice(0, colonIdx);
  if (version !== '1') throw new Error(`Unsupported encryption version: ${version}`);

  const key = getKey(envVar);
  const combined = Buffer.from(ciphertext.slice(colonIdx + 1), 'base64');

  const iv = combined.subarray(0, IV_BYTES);
  const authTag = combined.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const enc = combined.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Returns true if the string looks like an encrypted field (version prefix present). */
export function isEncrypted(value: string): boolean {
  return /^\d+:[A-Za-z0-9+/]+=*$/.test(value);
}

// ── PII masking for logs ──────────────────────────────────────────────────────

/**
 * Mask PII fields before logging. Returns a copy of `obj` with sensitive
 * values replaced by `[MASKED]`.
 */
const PII_LOG_KEYS = new Set([
  'accountidentifier',
  'account_identifier',
  'accountname',
  'account_name',
  'beneficiary_account_identifier',
  'beneficiary_account_name',
]);

export function maskPiiForLog<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_LOG_KEYS.has(k.toLowerCase())) {
      out[k] = '[MASKED]';
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = maskPiiForLog(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// ── Key rotation utility ──────────────────────────────────────────────────────

export interface RotationResult {
  rotated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Re-encrypt an array of record objects in-place.
 *
 * For each `field` path:
 *   1. Decrypts the current value using the *old* key (`ENCRYPTION_KEY`).
 *   2. Re-encrypts using the *new* key (`NEW_ENCRYPTION_KEY`).
 *   3. Returns the mutated array so callers can persist it.
 *
 * If a field is not currently encrypted (plaintext) it is encrypted with the new key.
 *
 * @param records   - Array of DB row objects (will be mutated)
 * @param fields    - Dot-notation field paths to rotate (e.g. ['beneficiary.accountIdentifier'])
 */
export function rotateFieldEncryption<T extends Record<string, unknown>>(
  records: T[],
  fields: string[],
): RotationResult {
  const result: RotationResult = { rotated: 0, skipped: 0, failed: 0, errors: [] };

  for (const record of records) {
    for (const field of fields) {
      const parts = field.split('.');
      try {
        // Navigate to parent object
        let parent: Record<string, unknown> = record;
        for (let i = 0; i < parts.length - 1; i++) {
          parent = parent[parts[i]] as Record<string, unknown>;
          if (!parent) break;
        }
        if (!parent) {
          result.skipped++;
          continue;
        }

        const key = parts[parts.length - 1];
        const current = parent[key] as string | undefined | null;
        if (current == null) {
          result.skipped++;
          continue;
        }

        // Decrypt with old key (or just use plaintext if not yet encrypted)
        const plaintext = isEncrypted(current) ? decryptField(current, 'ENCRYPTION_KEY') : current;

        // Re-encrypt with new key
        const newKey = process.env.NEW_ENCRYPTION_KEY;
        if (!newKey) throw new Error('NEW_ENCRYPTION_KEY is not set');

        // Temporarily override env to use new key
        const originalKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = newKey;
        try {
          parent[key] = encryptField(plaintext);
        } finally {
          process.env.ENCRYPTION_KEY = originalKey;
        }

        result.rotated++;
      } catch (err) {
        result.failed++;
        result.errors.push(`${field}: ${err instanceof Error ? err.message : String(err)}`);
        logger.error('field_encryption.rotation_failed', { field }, err);
      }
    }
  }

  return result;
}
