-- Migration: 019_create_webhook_subscriptions
-- Adds tables for managing outbound webhook subscriptions.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint_url TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  rate_limit_max_per_minute INTEGER NOT NULL DEFAULT 60,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_status
  ON webhook_subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_events
  ON webhook_subscriptions USING gin (events);

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_url TEXT NOT NULL,
  request_body TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  duration_ms BIGINT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_subscription
  ON webhook_delivery_logs (subscription_id, created_at DESC);
