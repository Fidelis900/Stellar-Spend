/**
 * Sentry server-side (Node.js) configuration.
 *
 * Extends the shared base from `src/lib/sentryShared` with server-only
 * integrations: OpenTelemetry trace correlation and CPU profiling.
 *
 * Loaded automatically by `@sentry/nextjs` for the Node.js runtime.
 */

import * as Sentry from '@sentry/nextjs';

import { sharedSentryOptions } from '@/lib/sentryShared';

Sentry.init({
  ...sharedSentryOptions,

  // Server-side profiling sample rate (subset of traced transactions)
  profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
});
