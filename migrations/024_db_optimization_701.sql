-- Migration: 024_db_optimization_701
-- Targeted index additions for issue #701 (Performance: DB query & index optimization pass)

-- Case-insensitive lookup index on user_address (supports LOWER(user_address) = LOWER($1))
CREATE INDEX IF NOT EXISTS idx_transactions_lower_user_address
  ON transactions (LOWER(user_address));

-- Composite index for user history queries ordered by recency
CREATE INDEX IF NOT EXISTS idx_transactions_user_address_created_at
  ON transactions (user_address, created_at DESC);

-- Fast lookup by payout order id (used in getByPayoutOrderId)
CREATE INDEX IF NOT EXISTS idx_transactions_payout_order_id
  ON transactions (payout_order_id);

-- Composite index for batch list queries filtered by user + status, ordered by recency
CREATE INDEX IF NOT EXISTS idx_transaction_batches_user_status_created
  ON transaction_batches (user_id, status, created_at DESC);

-- Composite index for batch member lookups filtered by status
CREATE INDEX IF NOT EXISTS idx_batch_transactions_batch_status
  ON batch_transactions (batch_id, status);

-- Partial index covering only active (pending/processing) batches to reduce index size
CREATE INDEX IF NOT EXISTS idx_transaction_batches_active
  ON transaction_batches (user_id, created_at DESC)
  WHERE status IN ('pending', 'processing');

-- Merchant accounts index (only if the table exists; safe no-op otherwise)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'merchant_accounts'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_merchant_accounts_user_id
             ON merchant_accounts (user_id)';
  END IF;
END
$$;
