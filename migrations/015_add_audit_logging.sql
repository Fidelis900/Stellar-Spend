-- Migration: 015_add_audit_logging
-- Creates tables for comprehensive audit trail

CREATE TABLE IF NOT EXISTS audit_logs (
  id                    TEXT PRIMARY KEY,
  user_address          TEXT,
  action_type           TEXT NOT NULL,
  resource_type         TEXT NOT NULL,
  resource_id           TEXT,
  action_details        TEXT,
  status                TEXT NOT NULL,
  ip_address            TEXT,
  user_agent            TEXT,
  session_id            TEXT,
  created_at            BIGINT NOT NULL,
  CONSTRAINT audit_logs_user_address_fk FOREIGN KEY (user_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_address
  ON audit_logs (user_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
  ON audit_logs (action_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type
  ON audit_logs (resource_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_status
  ON audit_logs (status);

CREATE TABLE IF NOT EXISTS admin_actions (
  id                    TEXT PRIMARY KEY,
  admin_address         TEXT NOT NULL,
  action_type           TEXT NOT NULL,
  target_user           TEXT,
  action_details        TEXT,
  reason                TEXT,
  created_at            BIGINT NOT NULL,
  CONSTRAINT admin_actions_admin_address_fk FOREIGN KEY (admin_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_address
  ON admin_actions (admin_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_action_type
  ON admin_actions (action_type);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON admin_actions (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log_retention (
  id                    TEXT PRIMARY KEY,
  retention_days        INTEGER NOT NULL,
  last_cleanup_at       BIGINT,
  created_at            BIGINT NOT NULL
);
