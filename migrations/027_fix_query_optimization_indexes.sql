-- Migration: 027_fix_query_optimization_indexes
-- Query optimization pass for #787.
--
-- 011_add_query_indexes.sql, 018_optimize_database_queries.sql, and
-- 024_db_optimization_701.sql all create indexes on
-- transactions(created_at DESC) / transactions(user_address, created_at DESC).
-- The transactions table has no created_at column (only `timestamp`, see
-- 001_create_transactions.sql) so every one of those CREATE INDEX
-- statements fails whenever it is actually executed against Postgres, and
-- the composite index intended to cover the getByUser history query
-- (src/lib/db/dal.ts) never exists. This migration adds the correctly
-- named replacement instead of editing the already-shipped files above.

-- Covers `SELECT * FROM transactions WHERE LOWER(user_address) = LOWER($1)
-- ORDER BY timestamp DESC` (dal.ts getByUser, used by the transaction
-- history / sync endpoints) in a single index instead of a scan + sort.
CREATE INDEX IF NOT EXISTS idx_transactions_lower_user_address_timestamp
  ON transactions (LOWER(user_address), timestamp DESC);

-- transaction_notification_preferences.user_address is a primary key, but
-- src/lib/notifications/preferences-store.ts queries it wrapped in LOWER(),
-- which the plain PK index can't serve.
CREATE INDEX IF NOT EXISTS idx_notification_preferences_lower_user_address
  ON transaction_notification_preferences (LOWER(user_address));
