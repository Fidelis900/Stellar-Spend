-- Migration 025: Create merchant accounts and payout tables

CREATE TYPE merchant_role AS ENUM ('owner', 'admin', 'viewer');
CREATE TYPE merchant_status AS ENUM ('active', 'suspended');
CREATE TYPE merchant_payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE merchant_item_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE merchant_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  business_name  TEXT NOT NULL,
  business_email TEXT NOT NULL,
  api_key_hash TEXT,
  role         merchant_role NOT NULL DEFAULT 'owner',
  webhook_url  TEXT,
  status       merchant_status NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX merchant_accounts_user_id_idx ON merchant_accounts (user_id);
CREATE INDEX merchant_accounts_status_idx ON merchant_accounts (status);

CREATE TABLE merchant_payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      UUID NOT NULL REFERENCES merchant_accounts(id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL UNIQUE,
  total_amount     NUMERIC(18, 6) NOT NULL,
  currency         TEXT NOT NULL,
  status           merchant_payout_status NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX merchant_payouts_merchant_id_idx ON merchant_payouts (merchant_id);
CREATE INDEX merchant_payouts_status_idx ON merchant_payouts (status);

CREATE TABLE merchant_payout_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id                UUID NOT NULL REFERENCES merchant_payouts(id) ON DELETE CASCADE,
  beneficiary_institution  TEXT NOT NULL,
  beneficiary_account      TEXT NOT NULL,
  beneficiary_name         TEXT NOT NULL,
  amount                   NUMERIC(18, 6) NOT NULL,
  currency                 TEXT NOT NULL,
  status                   merchant_item_status NOT NULL DEFAULT 'pending',
  error_message            TEXT
);

CREATE INDEX merchant_payout_items_payout_id_idx ON merchant_payout_items (payout_id);
CREATE INDEX merchant_payout_items_status_idx ON merchant_payout_items (status);
