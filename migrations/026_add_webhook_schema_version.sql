-- Migration: 026_add_webhook_schema_version
-- Adds a pinned schema version column to webhook subscriptions so integrators
-- can opt into a stable payload schema as it evolves.
-- Idempotent: safe to run multiple times.

ALTER TABLE webhook_subscriptions
  ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT '2';
