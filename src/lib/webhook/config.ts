import type { WebhookRetryConfig } from './types';

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function parsePositiveInt(value: string | undefined, name: string, defaultValue: number): number {
  if (isMissing(value)) return defaultValue;
  const parsed = parseInt(value!, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid environment variable ${name}: must be a positive integer, got "${value}"`,
    );
  }
  return parsed;
}

export function validateWebhookEnv(): WebhookRetryConfig {
  const alertChannelUrl = process.env.WEBHOOK_ALERT_CHANNEL_URL;
  if (isMissing(alertChannelUrl)) {
    throw new Error(
      'Invalid environment configuration for webhook retry mechanism.\n' +
        'Missing required env var: WEBHOOK_ALERT_CHANNEL_URL',
    );
  }

  const baseDelaySeconds = parsePositiveInt(
    process.env.WEBHOOK_RETRY_BASE_DELAY_SECONDS,
    'WEBHOOK_RETRY_BASE_DELAY_SECONDS',
    30,
  );

  const maxAttempts = parsePositiveInt(
    process.env.WEBHOOK_RETRY_MAX_ATTEMPTS,
    'WEBHOOK_RETRY_MAX_ATTEMPTS',
    5,
  );

  const alertSuppressionSeconds = parsePositiveInt(
    process.env.WEBHOOK_ALERT_SUPPRESSION_SECONDS,
    'WEBHOOK_ALERT_SUPPRESSION_SECONDS',
    300,
  );

  return {
    baseDelaySeconds,
    maxAttempts,
    jitterFactor: 0.25,
    alertChannelUrl: alertChannelUrl!,
    alertSuppressionSeconds,
    dlqRetentionDays: 30,
  };
}

export function getWebhookConfig(): WebhookRetryConfig {
  return validateWebhookEnv();
}
