-- Migration: 013_add_session_management
-- Creates tables for session management with timeout and refresh support

CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,
  user_address          TEXT NOT NULL,
  token                 TEXT NOT NULL UNIQUE,
  refresh_token         TEXT UNIQUE,
  ip_address            TEXT,
  user_agent            TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            BIGINT NOT NULL,
  expires_at            BIGINT NOT NULL,
  last_activity_at      BIGINT NOT NULL,
  refreshed_at          BIGINT,
  CONSTRAINT sessions_user_address_fk FOREIGN KEY (user_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_address
  ON sessions (user_address);

CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON sessions (token);

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token
  ON sessions (refresh_token);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS session_revocations (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL,
  user_address          TEXT NOT NULL,
  reason                TEXT,
  revoked_at            BIGINT NOT NULL,
  CONSTRAINT session_revocations_session_fk FOREIGN KEY (session_id) REFERENCES sessions(id),
  CONSTRAINT session_revocations_user_address_fk FOREIGN KEY (user_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_session_revocations_user_address
  ON session_revocations (user_address);

CREATE INDEX IF NOT EXISTS idx_session_revocations_session_id
  ON session_revocations (session_id);
