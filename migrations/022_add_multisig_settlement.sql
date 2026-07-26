-- Migration: multisig settlement authority tables

CREATE TABLE IF NOT EXISTS multisig_proposals (
  id           TEXT PRIMARY KEY,
  description  TEXT NOT NULL,
  target       TEXT NOT NULL,
  value        NUMERIC(36,0) NOT NULL,
  executed     BOOLEAN NOT NULL DEFAULT false,
  executed_by  TEXT,
  executed_at  BIGINT,
  created_at   BIGINT NOT NULL,
  expires_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS multisig_signatures (
  id           TEXT PRIMARY KEY,
  proposal_id  TEXT NOT NULL REFERENCES multisig_proposals(id),
  signer       TEXT NOT NULL,
  signature    TEXT NOT NULL,
  signed_at    BIGINT NOT NULL,
  UNIQUE (proposal_id, signer)
);

CREATE INDEX IF NOT EXISTS idx_multisig_signatures_proposal
  ON multisig_signatures(proposal_id);
