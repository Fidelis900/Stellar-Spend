-- Migration: 014_add_transaction_signing
-- Creates tables for transaction signing and verification

CREATE TABLE IF NOT EXISTS transaction_signatures (
  id                    TEXT PRIMARY KEY,
  transaction_id        TEXT NOT NULL,
  user_address          TEXT NOT NULL,
  signature             TEXT NOT NULL,
  public_key            TEXT NOT NULL,
  algorithm             TEXT NOT NULL,
  signed_at             BIGINT NOT NULL,
  verified_at           BIGINT,
  is_valid              BOOLEAN,
  verification_error    TEXT,
  CONSTRAINT transaction_signatures_transaction_fk FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT transaction_signatures_user_address_fk FOREIGN KEY (user_address) REFERENCES transactions(user_address)
);

CREATE INDEX IF NOT EXISTS idx_transaction_signatures_transaction_id
  ON transaction_signatures (transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_signatures_user_address
  ON transaction_signatures (user_address);

CREATE INDEX IF NOT EXISTS idx_transaction_signatures_signed_at
  ON transaction_signatures (signed_at DESC);

CREATE TABLE IF NOT EXISTS signature_verification_logs (
  id                    TEXT PRIMARY KEY,
  signature_id          TEXT NOT NULL,
  verification_status   TEXT NOT NULL,
  verified_by           TEXT,
  verified_at           BIGINT NOT NULL,
  details               TEXT,
  CONSTRAINT signature_verification_logs_signature_fk FOREIGN KEY (signature_id) REFERENCES transaction_signatures(id)
);

CREATE INDEX IF NOT EXISTS idx_signature_verification_logs_signature_id
  ON signature_verification_logs (signature_id);

CREATE INDEX IF NOT EXISTS idx_signature_verification_logs_verified_at
  ON signature_verification_logs (verified_at DESC);
