-- Migration: 018_optimize_database_queries
-- Adds indexes and optimizations for common query patterns

-- Transaction query optimization
CREATE INDEX IF NOT EXISTS idx_transactions_user_address_created_at
  ON transactions (user_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_status_created_at
  ON transactions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_bridge_tx_hash
  ON transactions (bridge_tx_hash);

-- Audit logs optimization
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_address_action_type
  ON audit_logs (user_address, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_created_at
  ON audit_logs (resource_type, created_at DESC);

-- API keys optimization
CREATE INDEX IF NOT EXISTS idx_api_keys_user_address_active
  ON api_keys (user_address, is_active);

-- Sessions optimization
CREATE INDEX IF NOT EXISTS idx_sessions_user_address_expires_at
  ON sessions (user_address, expires_at DESC);

-- Idempotency keys optimization
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_address_created_at
  ON idempotency_keys (user_address, created_at DESC);

-- Notifications optimization
CREATE INDEX IF NOT EXISTS idx_notifications_user_address_read
  ON notifications (user_address, is_read, created_at DESC);

-- Beneficiaries optimization
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_address_active
  ON beneficiaries (user_address, is_active);

-- Disputes optimization
CREATE INDEX IF NOT EXISTS idx_disputes_transaction_id_status
  ON disputes (transaction_id, status);

-- Referrals optimization
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created_at
  ON referrals (referrer_address, created_at DESC);

-- Partial indexes for common filters
CREATE INDEX IF NOT EXISTS idx_transactions_pending
  ON transactions (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transactions_failed
  ON transactions (created_at DESC)
  WHERE status = 'failed';

-- Composite indexes for common joins
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_created
  ON transactions (user_address, status, created_at DESC);

-- Enable query statistics collection
ALTER TABLE transactions ALTER COLUMN created_at SET STATISTICS 100;
ALTER TABLE audit_logs ALTER COLUMN created_at SET STATISTICS 100;
ALTER TABLE api_keys ALTER COLUMN user_address SET STATISTICS 100;
