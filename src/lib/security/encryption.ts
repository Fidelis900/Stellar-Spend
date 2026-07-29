import * as crypto from 'crypto';
import { logger } from '../logger';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  authTagLength: number;
  saltLength: number;
}

const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyLength: 32, // 256 bits
  ivLength: 16, // 128 bits
  authTagLength: 16, // 128 bits
  saltLength: 16, // 128 bits
};

/**
 * Get encryption key from environment or generate one
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (!keyEnv) {
    logger.warn('encryption_key_not_configured', {
      message: 'ENCRYPTION_KEY not set, using default key. This is insecure in production.',
    });
    return Buffer.alloc(DEFAULT_CONFIG.keyLength, 'default-key-change-in-production');
  }

  // If key is hex-encoded, decode it
  if (keyEnv.startsWith('0x')) {
    return Buffer.from(keyEnv.slice(2), 'hex');
  }

  // Otherwise, derive key from password using PBKDF2
  const salt = Buffer.from('stellar-spend-salt', 'utf-8');
  return crypto.pbkdf2Sync(keyEnv, salt, 100000, DEFAULT_CONFIG.keyLength, 'sha256');
}

/**
 * Encrypt data using AES-256-GCM
 */
export function encryptData(data: string | Buffer): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(DEFAULT_CONFIG.ivLength);
    const cipher = crypto.createCipheriv(DEFAULT_CONFIG.algorithm, key, iv);

    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    let encrypted = cipher.update(dataBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  } catch (error) {
    logger.error('encryption_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decryptData(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract IV, authTag, and encrypted data
    const iv = combined.slice(0, DEFAULT_CONFIG.ivLength);
    const authTag = combined.slice(
      DEFAULT_CONFIG.ivLength,
      DEFAULT_CONFIG.ivLength + DEFAULT_CONFIG.authTagLength,
    );
    const encrypted = combined.slice(DEFAULT_CONFIG.ivLength + DEFAULT_CONFIG.authTagLength);

    const decipher = crypto.createDecipheriv(DEFAULT_CONFIG.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf-8');
  } catch (error) {
    logger.error('decryption_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Decryption failed');
  }
}

/**
 * Encrypt object to JSON string
 */
export function encryptObject<T extends Record<string, unknown>>(obj: T): string {
  const jsonString = JSON.stringify(obj);
  return encryptData(jsonString);
}

/**
 * Decrypt JSON string to object
 */
export function decryptObject<T extends Record<string, unknown>>(encryptedData: string): T {
  const jsonString = decryptData(encryptedData);
  return JSON.parse(jsonString) as T;
}

/**
 * Hash data using SHA-256
 */
export function hashData(data: string | Buffer): string {
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return crypto.createHash('sha256').update(dataBuffer).digest('hex');
}

/**
 * Verify hashed data
 */
export function verifyHash(data: string | Buffer, hash: string): boolean {
  return hashData(data) === hash;
}

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(DEFAULT_CONFIG.keyLength).toString('hex');
}

/**
 * Encrypt sensitive fields in an object
 */
export function encryptSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[],
): Record<string, unknown> {
  const encrypted: Record<string, unknown> = { ...obj };

  for (const field of sensitiveFields) {
    if (field in encrypted && encrypted[field] !== null && encrypted[field] !== undefined) {
      const value = encrypted[field];
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      encrypted[`${field}_encrypted`] = encryptData(stringValue);
      delete encrypted[field];
    }
  }

  return encrypted;
}

/**
 * Decrypt sensitive fields in an object
 */
export function decryptSensitiveFields<T extends Record<string, unknown>>(
  obj: Record<string, unknown>,
  sensitiveFields: string[],
): T {
  const decrypted: Record<string, unknown> = { ...obj };

  for (const field of sensitiveFields) {
    const encryptedField = `${field}_encrypted`;
    if (encryptedField in decrypted && typeof decrypted[encryptedField] === 'string') {
      try {
        const decryptedValue = decryptData(decrypted[encryptedField] as string);
        decrypted[field] = decryptedValue;
        delete decrypted[encryptedField];
      } catch (error) {
        logger.error('sensitive_field_decryption_failed', {
          field,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return decrypted as T;
}

/**
 * Encrypt localStorage data
 */
export function encryptLocalStorageData(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;

  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const encrypted = encryptData(stringValue);
    localStorage.setItem(`encrypted_${key}`, encrypted);
    // Remove unencrypted version if it exists
    localStorage.removeItem(key);
  } catch (error) {
    logger.error('localstorage_encryption_failed', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Decrypt localStorage data
 */
export function decryptLocalStorageData<T = unknown>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const encrypted = localStorage.getItem(`encrypted_${key}`);
    if (!encrypted) {
      // Fallback to unencrypted data for migration
      const unencrypted = localStorage.getItem(key);
      if (unencrypted) {
        try {
          return JSON.parse(unencrypted) as T;
        } catch {
          return unencrypted as T;
        }
      }
      return null;
    }

    const decrypted = decryptData(encrypted);
    try {
      return JSON.parse(decrypted) as T;
    } catch {
      return decrypted as T;
    }
  } catch (error) {
    logger.error('localstorage_decryption_failed', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Encrypt log entry
 */
export function encryptLogEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'privateKey'];
  const encrypted: Record<string, unknown> = { ...entry };

  for (const field of sensitiveFields) {
    if (field in encrypted && encrypted[field] !== null && encrypted[field] !== undefined) {
      const value = encrypted[field];
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      encrypted[`${field}_hash`] = hashData(stringValue);
      delete encrypted[field];
    }
  }

  return encrypted;
}

/**
 * Encrypt backup data
 */
export function encryptBackupData(data: Record<string, unknown>): string {
  const jsonString = JSON.stringify(data);
  const encrypted = encryptData(jsonString);
  return JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    encrypted,
    checksum: hashData(jsonString),
  });
}

/**
 * Decrypt backup data
 */
export function decryptBackupData(backupString: string): Record<string, unknown> | null {
  try {
    const backup = JSON.parse(backupString);
    if (backup.version !== 1) {
      logger.error('backup_version_mismatch', { version: backup.version });
      return null;
    }

    const decrypted = decryptData(backup.encrypted);
    const data = JSON.parse(decrypted);

    // Verify checksum
    const checksum = hashData(decrypted);
    if (checksum !== backup.checksum) {
      logger.error('backup_checksum_mismatch', {
        expected: backup.checksum,
        actual: checksum,
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.error('backup_decryption_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
