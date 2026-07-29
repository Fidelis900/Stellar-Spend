export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface DeliveryAttempt {
  attemptNumber: number; // 1-based
  timestamp: string; // ISO 8601
  httpStatus?: number; // undefined for network errors
  errorType?: string; // e.g. 'NETWORK_ERROR', 'TIMEOUT'
  durationMs: number;
}

export interface WebhookPayload {
  headers: Record<string, string>; // original inbound headers (sensitive values redacted)
  body: string; // raw body string
  source: string; // e.g. 'paycrest'
}

export interface DeliveryRecord {
  id: string; // UUID, unique delivery ID
  destinationUrl: string;
  payload: WebhookPayload;
  status: DeliveryStatus;
  attemptCount: number; // total attempts made so far
  maxAttempts: number; // from config, default 5
  attempts: DeliveryAttempt[];
  nextAttemptAt: string | null; // ISO 8601, null when delivered/failed
  createdAt: string;
  updatedAt: string;
}

export interface DLQEntry {
  id: string; // UUID
  deliveryId: string; // references DeliveryRecord.id
  destinationUrl: string;
  payload: WebhookPayload;
  attempts: DeliveryAttempt[];
  finalError: string;
  addedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601, addedAt + 30 days
}

export interface WebhookRetryConfig {
  baseDelaySeconds: number; // WEBHOOK_RETRY_BASE_DELAY_SECONDS, default 30
  maxAttempts: number; // WEBHOOK_RETRY_MAX_ATTEMPTS, default 5
  jitterFactor: number; // fixed at 0.25 (25%)
  alertChannelUrl: string; // WEBHOOK_ALERT_CHANNEL_URL (Slack webhook or email endpoint)
  alertSuppressionSeconds: number; // WEBHOOK_ALERT_SUPPRESSION_SECONDS, default 300
  dlqRetentionDays: number; // fixed at 30
}
