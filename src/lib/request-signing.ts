/**
 * Request signing utilities for API authentication
 * Implements HMAC-based request signing with timestamp validation
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface SignatureConfig {
  algorithm: 'sha256' | 'sha512';
  encoding: 'hex' | 'base64';
  timestampTolerance: number; // milliseconds
}

export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  algorithm: 'sha256',
  encoding: 'hex',
  timestampTolerance: 5 * 60 * 1000, // 5 minutes
};

/**
 * Generate HMAC signature for request
 */
export function generateSignature(
  method: string,
  path: string,
  body: string | null,
  timestamp: string,
  secret: string,
  config: SignatureConfig = DEFAULT_SIGNATURE_CONFIG,
): string {
  const message = [method, path, body || '', timestamp].join('\n');

  const hmac = createHmac(config.algorithm, secret);
  hmac.update(message);

  return hmac.digest(config.encoding);
}

/**
 * Verify request signature
 */
export function verifySignature(
  method: string,
  path: string,
  body: string | null,
  timestamp: string,
  signature: string,
  secret: string,
  config: SignatureConfig = DEFAULT_SIGNATURE_CONFIG,
): { valid: boolean; error?: string } {
  // Validate timestamp
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();

  if (isNaN(requestTime)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  if (Math.abs(now - requestTime) > config.timestampTolerance) {
    return { valid: false, error: 'Request timestamp is too old or in the future' };
  }

  // Generate expected signature
  const expectedSignature = generateSignature(method, path, body, timestamp, secret, config);

  // Use constant-time comparison to prevent timing attacks
  try {
    const isValid = timingSafeEqual(
      Buffer.from(signature, config.encoding),
      Buffer.from(expectedSignature, config.encoding),
    );
    return { valid: isValid };
  } catch {
    return { valid: false, error: 'Signature verification failed' };
  }
}

/**
 * Extract signature from request headers
 */
export function extractSignatureFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): {
  signature?: string;
  timestamp?: string;
  error?: string;
} {
  const signature = headers['x-signature'] || headers['x-hmac-signature'];
  const timestamp = headers['x-timestamp'] || headers['x-request-timestamp'];

  if (!signature) {
    return { error: 'Missing signature header (x-signature or x-hmac-signature)' };
  }

  if (!timestamp) {
    return { error: 'Missing timestamp header (x-timestamp or x-request-timestamp)' };
  }

  return {
    signature: Array.isArray(signature) ? signature[0] : signature,
    timestamp: Array.isArray(timestamp) ? timestamp[0] : timestamp,
  };
}

/**
 * Generate timestamp for request signing
 */
export function generateTimestamp(): string {
  return Date.now().toString();
}

/**
 * Create signed request headers
 */
export function createSignedRequestHeaders(
  method: string,
  path: string,
  body: string | null,
  secret: string,
  config: SignatureConfig = DEFAULT_SIGNATURE_CONFIG,
): Record<string, string> {
  const timestamp = generateTimestamp();
  const signature = generateSignature(method, path, body, timestamp, secret, config);

  return {
    'x-signature': signature,
    'x-timestamp': timestamp,
  };
}

/**
 * Validate request signature and timestamp
 */
export function validateRequestSignature(
  method: string,
  path: string,
  body: string | null,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  config: SignatureConfig = DEFAULT_SIGNATURE_CONFIG,
): { valid: boolean; error?: string } {
  const { signature, timestamp, error: extractError } = extractSignatureFromHeaders(headers);

  if (extractError) {
    return { valid: false, error: extractError };
  }

  if (!signature || !timestamp) {
    return { valid: false, error: 'Missing signature or timestamp' };
  }

  return verifySignature(method, path, body, timestamp, signature, secret, config);
}

/**
 * Replay attack prevention - track used timestamps
 */
export class ReplayAttackPrevention {
  private usedTimestamps: Set<string> = new Set();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private toleranceMs: number = 5 * 60 * 1000) {
    // Clean up old timestamps every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Check if timestamp has been used before
   */
  isReplay(timestamp: string): boolean {
    return this.usedTimestamps.has(timestamp);
  }

  /**
   * Record timestamp as used
   */
  recordTimestamp(timestamp: string): void {
    this.usedTimestamps.add(timestamp);
  }

  /**
   * Clean up old timestamps
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.toleranceMs;

    const toDelete: string[] = [];
    for (const timestamp of this.usedTimestamps) {
      if (parseInt(timestamp, 10) < cutoff) {
        toDelete.push(timestamp);
      }
    }

    for (const timestamp of toDelete) {
      this.usedTimestamps.delete(timestamp);
    }
  }

  /**
   * Destroy the cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
