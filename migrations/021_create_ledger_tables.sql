-- Migration: 021_create_ledger_tables
-- Adds double-entry ledger tables for finance reporting.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  category TEXT NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  reference_type TEXT,
  reference_id TEXT,
  entry_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_reconciliation (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  reported_balance TEXT NOT NULL,
  ledger_balance TEXT NOT NULL,
  difference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unreconciled' CHECK (status IN ('unreconciled', 'reconciled', 'discrepancy')),
  reconciled_at BIGINT,
  notes TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account
  ON ledger_entries (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction
  ON ledger_entries (transaction_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference
  ON ledger_entries (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_hash
  ON ledger_entries (entry_hash);

CREATE INDEX IF NOT EXISTS idx_ledger_reconciliation_report
  ON ledger_reconciliation (report_id);
