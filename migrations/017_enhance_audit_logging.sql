-- Migration: 017_enhance_audit_logging
-- Enhances audit logging with additional tables for API key usage and sensitive data access

CREATE TABLE IF NOT EXISTS api_key_usage_logs (
  id                    TEXT PRIMARY KEY,
  api_key_id            TEXT NOT NULL,
  endpoint              TEXT NOT NULL,
  method                TEXT NOT NULL,
  status_code           INTEGER NOT NULL,
  ip_address            TEXT,
  user_agent            TEXT,
  created_at            BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_logs_api_key_id
  ON api_key_usage_logs (api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_logs_created_at
  ON api_key_usage_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS sensitive_data_access_logs (
  id                    TEXT PRIMARY KEY,
  user_address          TEXT,
  accessed_by           TEXT NOT NULL,
  data_type             TEXT NOT NULL,
  resource_id           TEXT,
  reason                TEXT,
  created_at            BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensitive_data_access_logs_user_address
  ON sensitive_data_access_logs (user_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensitive_data_access_logs_accessed_by
  ON sensitive_data_access_logs (accessed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensitive_data_access_logs_data_type
  ON sensitive_data_access_logs (data_type);

CREATE INDEX IF NOT EXISTS idx_sensitive_data_access_logs_created_at
  ON sensitive_data_access_logs (created_at DESC);
