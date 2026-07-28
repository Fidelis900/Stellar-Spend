/**
 * Sentry edge-runtime configuration.
 *
 * Extends the shared base from `src/lib/sentryShared`. The edge runtime does
 * not support Node.js integrations (profiling, OpenTelemetry), so only the
 * common options are applied.
 *
 * Loaded automatically by `@sentry/nextjs` for Next.js Edge routes and
 * middleware.
 */

import * as Sentry from '@sentry/nextjs';

import { sharedSentryOptions } from '@/lib/sentryShared';

Sentry.init({
  ...sharedSentryOptions,
});
