-- Migration: 023_field_level_encryption_pii
-- Adds encrypted columns for PII fields in the transactions table (#692).
--
-- Strategy: add the encrypted columns alongside the originals so the
-- application can dual-read during migration (reads new if present, else old).
-- The old plaintext columns are NOT dropped here to allow rollback.
-- A follow-up migration (021) should drop the plaintext columns after
-- all rows are confirmed encrypted and key rotation has been tested.
--
-- Idempotent: safe to run multiple times.

-- Add encrypted PII columns (nullable during migration window)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS beneficiary_account_identifier_enc TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_account_name_enc TEXT;

-- Comment the old plaintext columns to make their purpose clear during migration
COMMENT ON COLUMN transactions.beneficiary_account_identifier IS
  'Plaintext — being migrated to beneficiary_account_identifier_enc. Will be dropped after migration.';

COMMENT ON COLUMN transactions.beneficiary_account_name IS
  'Plaintext — being migrated to beneficiary_account_name_enc. Will be dropped after migration.';

COMMENT ON COLUMN transactions.beneficiary_account_identifier_enc IS
  'AES-256-GCM encrypted value of beneficiary_account_identifier. Format: <version>:<base64>.';

COMMENT ON COLUMN transactions.beneficiary_account_name_enc IS
  'AES-256-GCM encrypted value of beneficiary_account_name. Format: <version>:<base64>.';
