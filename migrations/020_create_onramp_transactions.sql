-- Migration: 020_create_onramp_transactions
-- Stores on-ramp (fiat in → stablecoin out to Stellar) transactions.

CREATE TABLE IF NOT EXISTS onramp_transactions (
  id                    TEXT PRIMARY KEY,
  quote_id              TEXT NOT NULL,
  state                 TEXT NOT NULL DEFAULT 'draft',
  fiat_amount           TEXT NOT NULL,
  fiat_currency         TEXT NOT NULL,
  destination_amount    TEXT NOT NULL,
  destination_token     TEXT NOT NULL,
  destination_address   TEXT NOT NULL,
  destination_network   TEXT NOT NULL DEFAULT 'stellar',
  provider              TEXT NOT NULL,
  provider_order_id     TEXT,
  rate                  DOUBLE PRECISION NOT NULL,
  deposit_address       TEXT,
  deposit_network       TEXT,
  deposit_amount        TEXT,
  deposit_token         TEXT,
  bridge_tx_hash        TEXT,
  bridge_status         TEXT,
  error                 TEXT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  expires_at            BIGINT,
  CONSTRAINT onramp_state_check CHECK (state IN (
    'draft', 'quoted', 'order_created', 'deposit_pending',
    'deposit_confirmed', 'bridge_pending', 'bridge_completed',
    'completed', 'failed', 'expired'
  ))
);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_state
  ON onramp_transactions (state);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_provider
  ON onramp_transactions (provider, state);

CREATE INDEX IF NOT EXISTS idx_onramp_transactions_destination
  ON onramp_transactions (destination_address);
