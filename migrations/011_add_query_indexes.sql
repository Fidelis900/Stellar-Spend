-- Database indexes for query optimization
-- Run this migration to add indexes for frequently queried columns

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_address ON transactions(user_address);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON transactions(user_address, status);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);

-- Idempotency keys table indexes
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);

-- Transaction notifications table indexes
CREATE INDEX IF NOT EXISTS idx_transaction_notifications_tx_id ON transaction_notifications(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_notifications_status ON transaction_notifications(status);

-- API keys table indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);

-- Transaction batching table indexes
CREATE INDEX IF NOT EXISTS idx_transaction_batches_user_id ON transaction_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_batches_status ON transaction_batches(status);

-- Transaction scheduling table indexes
CREATE INDEX IF NOT EXISTS idx_transaction_schedules_user_id ON transaction_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_schedules_next_run ON transaction_schedules(next_run_at);

-- Referral program table indexes
CREATE INDEX IF NOT EXISTS idx_referral_program_referrer_id ON referral_program(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_program_referee_id ON referral_program(referee_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON transactions(status, created_at DESC);
