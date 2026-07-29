import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

/**
 * Escape special characters for SQL to prevent SQL injection
 */
export function escapeSql(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/"/g, '\\"')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
}

/**
 * Escape special characters for NoSQL/MongoDB to prevent injection
 */
export function escapeNoSql(input: unknown): unknown {
  if (typeof input === 'string') {
    return input.replace(/\$/g, '\\$').replace(/\./g, '\\.');
  }
  if (typeof input === 'object' && input !== null) {
    if (Array.isArray(input)) {
      return input.map(escapeNoSql);
    }
    const escaped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const escapedKey = escapeNoSql(key);
      escaped[escapedKey as string] = escapeNoSql(value);
    }
    return escaped;
  }
  return input;
}

/**
 * Escape shell metacharacters to prevent command injection
 */
export function escapeShell(input: string): string {
  if (typeof input !== 'string') return '';
  return `'${input.replace(/'/g, "'\\''")}'`;
}

/**
 * Sanitize user input for safe use in URLs
 */
export function sanitizeUrl(input: string): string {
  if (typeof input !== 'string') return '';
  try {
    const url = new URL(input);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Sanitize email addresses
 */
export function sanitizeEmail(input: string): string {
  if (typeof input !== 'string') return '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input) ? input.toLowerCase().trim() : '';
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(input: unknown): number | null {
  const num = Number(input);
  return Number.isFinite(num) ? num : null;
}

/**
 * Sanitize object keys to prevent prototype pollution
 */
export function sanitizeObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!dangerous.includes(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize JSON string to prevent injection
 */
export function sanitizeJson(input: string): Record<string, unknown> | null {
  if (typeof input !== 'string') return null;
  try {
    const parsed = JSON.parse(input);
    return sanitizeObjectKeys(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Validate and sanitize Stellar address
 */
export function sanitizeStellarAddress(input: string): string {
  if (typeof input !== 'string') return '';
  const stellarAddressRegex = /^G[A-Z2-7]{55}$/;
  return stellarAddressRegex.test(input) ? input : '';
}

/**
 * Validate and sanitize blockchain address (Ethereum-like)
 */
export function sanitizeBlockchainAddress(input: string): string {
  if (typeof input !== 'string') return '';
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  return addressRegex.test(input) ? input.toLowerCase() : '';
}
