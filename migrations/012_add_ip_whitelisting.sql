-- Migration: 012_add_ip_whitelisting
-- Creates tables for IP whitelisting and violation logging

CREATE TABLE IF NOT EXISTS ip_whitelist (
  id                    TEXT PRIMARY KEY,
  user_address          TEXT NOT NULL,
  ip_address            TEXT NOT NULL,
  ip_range_start        TEXT,
  ip_range_end          TEXT,
  label                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            BIGINT NOT NULL,
  last_used_at          BIGINT,
  CONSTRAINT ip_whitelist_user_address_fk FOREIGN KEY (user_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_ip_whitelist_user_address
  ON ip_whitelist (user_address);

CREATE INDEX IF NOT EXISTS idx_ip_whitelist_ip_address
  ON ip_whitelist (ip_address);

CREATE TABLE IF NOT EXISTS ip_violations (
  id                    TEXT PRIMARY KEY,
  user_address          TEXT NOT NULL,
  ip_address            TEXT NOT NULL,
  violation_type        TEXT NOT NULL,
  severity              TEXT NOT NULL,
  details               TEXT,
  created_at            BIGINT NOT NULL,
  CONSTRAINT ip_violations_user_address_fk FOREIGN KEY (user_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_ip_violations_user_address
  ON ip_violations (user_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ip_violations_ip_address
  ON ip_violations (ip_address);
