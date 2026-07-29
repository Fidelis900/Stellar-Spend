/**
 * Sentry client-side (browser) configuration.
 *
 * Extends the shared base from `src/lib/sentryShared` with browser-only
 * integrations: Session Replay and Browser Tracing.
 *
 * Loaded automatically by `@sentry/nextjs` for the browser bundle.
 */

import * as Sentry from '@sentry/nextjs';

import { sharedSentryOptions } from '@/lib/sentryShared';

Sentry.init({
  ...sharedSentryOptions,

  // Session replay for error investigation (1% normal traffic, 100% on error)
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],
});
