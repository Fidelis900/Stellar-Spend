-- up
-- Expand phase: Add balance column
ALTER TABLE users ADD COLUMN balance DECIMAL(15,2) DEFAULT 0.00;

-- Contract phase: Remove old balance tracking (if any)
-- DROP TABLE IF EXISTS old_balances; -- Only after validation

-- down
-- Contract phase: Remove added column
ALTER TABLE users DROP COLUMN balance;
