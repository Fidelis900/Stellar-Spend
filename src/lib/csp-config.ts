/**
 * Content Security Policy (CSP) configuration and utilities
 * Provides CSP directives and validation
 */

import crypto from 'crypto';

export interface CSPDirectives {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'font-src': string[];
  'img-src': string[];
  'connect-src': string[];
  'frame-ancestors': string[];
  'base-uri': string[];
  'form-action': string[];
  'upgrade-insecure-requests'?: string[];
  'report-uri'?: string[];
}

/**
 * Generate a nonce for CSP
 */
export function generateNonce(): string {
  // Use Web Crypto API (available in Next.js runtime)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  // Convert to base64 without Buffer (browser-compatible)
  return btoa(String.fromCharCode(...array));
}

/**
 * CSP directives configuration (nonce-based, no unsafe-*)
 */
export const CSP_DIRECTIVES: CSPDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'nonce-{nonce}'", 'https://cdn.jsdelivr.net', 'https://cdn.sentry.io'],
  'style-src': ["'self'", "'nonce-{nonce}'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'connect-src': ["'self'", 'https:', 'wss:', 'https://sentry.io'],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
  'report-uri': ['/api/csp-report'],
};

/**
 * Build CSP header value from directives
 */
export function buildCSPHeader(directives: CSPDirectives): string {
  return Object.entries(directives)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Validate CSP header syntax
 */
export function validateCSPHeader(header: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for common CSP syntax issues
  if (!header || header.trim().length === 0) {
    errors.push('CSP header is empty');
  }

  // Validate directive format
  const directives = header.split(';').map((d) => d.trim());
  for (const directive of directives) {
    if (!directive) continue;

    const parts = directive.split(/\s+/);
    if (parts.length < 1) {
      errors.push(`Invalid directive format: ${directive}`);
    }

    // Check for common mistakes
    if (directive.includes("'unsafe-inline'") && directive.includes("'nonce-")) {
      errors.push("Cannot use both 'unsafe-inline' and nonce in the same directive");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get CSP directives for specific environment
 */
export function getCSPDirectivesForEnvironment(env: 'development' | 'production'): CSPDirectives {
  const directives = { ...CSP_DIRECTIVES };

  if (env === 'development') {
    // Allow localhost for development
    directives['connect-src'] = [
      ...directives['connect-src'],
      'http://localhost:*',
      'ws://localhost:*',
    ];
  }

  return directives;
}
