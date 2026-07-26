-- Migration: 016_add_api_key_scopes
-- Adds scopes/permissions column to api_keys table.
-- Idempotent: safe to run multiple times.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '["transactions:read"]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_api_keys_scopes
  ON api_keys USING gin (scopes);
