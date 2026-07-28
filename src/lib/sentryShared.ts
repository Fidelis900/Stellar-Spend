/**
 * Shared Sentry configuration base.
 *
 * All three Sentry entry-points (client, server, edge) import and extend these
 * shared options so that common settings — DSN resolution, environment tagging,
 * sample rates, noise filters, and PII scrubbing — are kept in one place.
 *
 * Runtime-specific options (integrations, profiling, replay) are added in each
 * entry-point file on top of this base.
 */

import type { BrowserOptions } from '@sentry/nextjs';

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Sentry DSN.
 *
 * The client runtime only has access to `NEXT_PUBLIC_*` variables, so we
 * accept both forms and let the caller pass the right one.
 */
export function resolveDsn(publicDsn?: string, serverDsn?: string): string | undefined {
  return publicDsn ?? serverDsn ?? undefined;
}

/**
 * Derive the `environment` tag from available env vars.
 * Prefers the explicit `NEXT_PUBLIC_ENV` / `NODE_ENV` value.
 */
export function resolveEnvironment(): string {
  return (
    (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV)) ||
    'development'
  );
}

/**
 * Derive the release string.
 * Falls back to the npm package version so releases are always tagged.
 */
export function resolveRelease(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return (
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    process.env.SENTRY_RELEASE ??
    process.env.npm_package_version ??
    undefined
  );
}

/**
 * Read the traces sample rate from env, falling back to the supplied default.
 */
export function resolveTracesSampleRate(fallback = 0.1): number {
  if (typeof process === 'undefined') return fallback;
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// Shared `beforeSend` — strip PII / secrets from captured events
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = ['privateKey', 'secret', 'password', 'token', 'mnemonic'] as const;

type SentryEvent = Parameters<NonNullable<BrowserOptions['beforeSend']>>[0];

/**
 * Scrub known sensitive field names from the captured event's request body.
 * Each entry-point can wrap or replace this with additional runtime logic.
 */
export function beforeSend(event: SentryEvent): SentryEvent | null {
  if (event.request?.data) {
    const data = event.request.data as Record<string, unknown>;
    for (const key of SENSITIVE_KEYS) {
      if (key in data) data[key] = '[Filtered]';
    }
  }
  return event;
}

// ---------------------------------------------------------------------------
// Shared ignore-list — filter common noise that is not actionable
// ---------------------------------------------------------------------------

export const SHARED_IGNORE_ERRORS: Array<string | RegExp> = [
  // Browser quirks
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications.',
  // Unhandled promise rejections that are not real errors
  'Non-Error promise rejection captured',
  // Network issues outside our control
  /^Network Error$/,
  /^Request aborted$/,
  // Extension / third-party noise
  /^ChunkLoadError/,
];

// ---------------------------------------------------------------------------
// Base Sentry options shared by all three runtimes
// ---------------------------------------------------------------------------

/**
 * Common Sentry `init` options.
 *
 * Each entry-point should spread this object into its own `Sentry.init({...})`
 * call and then add runtime-specific fields (integrations, etc.).
 *
 * @example
 * ```ts
 * import { sharedSentryOptions } from '@/lib/sentryShared';
 * Sentry.init({
 *   ...sharedSentryOptions,
 *   integrations: [...],
 * });
 * ```
 */
export const sharedSentryOptions = {
  dsn: resolveDsn(
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SENTRY_DSN : undefined,
    typeof process !== 'undefined' ? process.env.SENTRY_DSN : undefined,
  ),
  environment: resolveEnvironment(),
  release: resolveRelease(),
  tracesSampleRate: resolveTracesSampleRate(
    typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  ),
  ignoreErrors: SHARED_IGNORE_ERRORS,
  beforeSend,
  debug: false,
} as const satisfies BrowserOptions;
