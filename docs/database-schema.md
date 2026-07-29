# Database Schema Documentation

This document describes the PostgreSQL database schema for Stellar-Spend, including all tables, columns, indexes, relationships, data retention policies, backup/restore procedures, migration guide, example queries, and query optimisation strategies.

---

## Table of Contents

- [Overview](#overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Tables](#tables)
  - [transactions](#transactions)
  - [idempotency_keys](#idempotency_keys)
  - [transaction_notification_preferences](#transaction_notification_preferences)
  - [transaction_notification_deliveries](#transaction_notification_deliveries)
  - [api_keys](#api_keys)
  - [api_key_usage_events](#api_key_usage_events)
  - [transaction_insurance](#transaction_insurance)
  - [transaction_batches](#transaction_batches)
  - [batch_transactions](#batch_transactions)
  - [referral_codes](#referral_codes)
  - [referral_rewards](#referral_rewards)
  - [scheduled_transactions](#scheduled_transactions)
  - [ip_whitelist](#ip_whitelist)
  - [ip_violations](#ip_violations)
  - [transaction_disputes](#transaction_disputes)
  - [sessions](#sessions)
  - [session_revocations](#session_revocations)
  - [transaction_signatures](#transaction_signatures)
  - [signature_verification_logs](#signature_verification_logs)
  - [audit_logs](#audit_logs)
  - [admin_actions](#admin_actions)
  - [audit_log_retention](#audit_log_retention)
- [Indexes](#indexes)
- [Data Retention Policies](#data-retention-policies)
- [Backup and Restore Procedures](#backup-and-restore-procedures)
- [Migration Guide](#migration-guide)
- [Example Queries](#example-queries)
- [Query Optimisation Strategies](#query-optimisation-strategies)

---

## Overview

Stellar-Spend uses **PostgreSQL** as its primary datastore. The schema is managed through numbered migration files in the [`migrations/`](../migrations/) directory. All migrations are idempotent — they use `IF NOT EXISTS` and conditional DDL so they can be re-run safely.

**Connection:** Configure the connection string via the `DATABASE_URL` environment variable (see [Environment Variables](./environment-variables.md)).

---

## Entity Relationship Diagram

```
┌─────────────────────────┐
│       transactions      │◄────────────────────────────────┐
│  PK: id (TEXT)          │                                 │
│  user_address (TEXT)    │◄──────────────────────────┐     │
└────────────┬────────────┘                           │     │
             │                                        │     │
             │ 1:N                                    │ FK  │ FK
             ▼                                        │     │
┌─────────────────────────┐      ┌────────────────────┴─────┴──────┐
│ transaction_insurance   │      │         sessions                │
│ FK: transaction_id      │      │  PK: id (TEXT)                  │
└─────────────────────────┘      │  user_address → transactions    │
                                 └─────────────────────────────────┘
             │ 1:N                             │ 1:N
             ▼                                 ▼
┌─────────────────────────┐      ┌─────────────────────────────────┐
│   transaction_disputes  │      │      session_revocations        │
│  FK: transaction_id     │      │  FK: session_id                 │
└─────────────────────────┘      └─────────────────────────────────┘

┌─────────────────────────┐      ┌─────────────────────────────────┐
│   transaction_batches   │      │  transaction_notification_      │
│  PK: id (UUID)          │      │  preferences                    │
│  user_id                │      │  PK: user_address               │
└────────────┬────────────┘      └─────────────────────────────────┘
             │ 1:N                             │ 1:N
             ▼                                 ▼
┌─────────────────────────┐      ┌─────────────────────────────────┐
│  batch_transactions     │      │ transaction_notification_       │
│  FK: batch_id           │      │ deliveries                      │
│  FK: transaction_id     │      │  FK: transaction_id             │
└─────────────────────────┘      └─────────────────────────────────┘

┌─────────────────────────┐      ┌─────────────────────────────────┐
│     api_keys            │      │   transaction_signatures        │
│  PK: id (TEXT)          │      │  FK: transaction_id             │
└────────────┬────────────┘      └────────────┬────────────────────┘
             │ 1:N                             │ 1:N
             ▼                                 ▼
┌─────────────────────────┐      ┌─────────────────────────────────┐
│  api_key_usage_events   │      │  signature_verification_logs    │
│  FK: api_key_id         │      │  FK: signature_id               │
└─────────────────────────┘      └─────────────────────────────────┘

┌─────────────────────────┐      ┌─────────────────────────────────┐
│     referral_codes      │      │          audit_logs             │
│  PK: id (UUID)          │      │  FK: user_address               │
└─────────────────────────┘      └─────────────────────────────────┘

┌─────────────────────────┐      ┌─────────────────────────────────┐
│    referral_rewards     │      │        admin_actions            │
│  FK: referral_code      │      │  FK: admin_address              │
└─────────────────────────┘      └─────────────────────────────────┘
```

---

## Tables

### `transactions`

**Migration:** `001_create_transactions.sql`, extended by `002_add_transaction_analytics_fields.sql`

The core table. Every offramp transaction — from initiation through bridge and payout — is recorded here.

| Column                           | Type   | Nullable | Description                                                       |
| -------------------------------- | ------ | -------- | ----------------------------------------------------------------- |
| `id`                             | TEXT   | NOT NULL | Primary key — unique transaction identifier                       |
| `timestamp`                      | BIGINT | NOT NULL | Unix timestamp (ms) when the transaction was created              |
| `user_address`                   | TEXT   | NOT NULL | Stellar wallet address of the initiating user                     |
| `amount`                         | TEXT   | NOT NULL | Transaction amount as a string (preserves precision)              |
| `currency`                       | TEXT   | NOT NULL | Source currency code (e.g., `USDC`)                               |
| `stellar_tx_hash`                | TEXT   | NULL     | Stellar network transaction hash after submission                 |
| `bridge_status`                  | TEXT   | NULL     | Current status reported by Allbridge                              |
| `payout_order_id`                | TEXT   | NULL     | Paycrest order ID for the fiat payout leg                         |
| `payout_status`                  | TEXT   | NULL     | Status of the Paycrest payout order                               |
| `beneficiary_institution`        | TEXT   | NOT NULL | Institution code for the beneficiary bank                         |
| `beneficiary_account_identifier` | TEXT   | NOT NULL | Account number / IBAN of the beneficiary                          |
| `beneficiary_account_name`       | TEXT   | NOT NULL | Full name of the beneficiary account holder                       |
| `beneficiary_currency`           | TEXT   | NOT NULL | Destination fiat currency (e.g., `NGN`, `KES`)                    |
| `status`                         | TEXT   | NOT NULL | Overall transaction status: `pending`, `completed`, `failed`      |
| `error`                          | TEXT   | NULL     | Error message if the transaction failed                           |
| `finalized_at`                   | BIGINT | NULL     | Unix timestamp (ms) when the transaction reached a terminal state |
| `fee_method`                     | TEXT   | NULL     | Fee payment method: `native` or `stablecoin`                      |
| `bridge_fee`                     | TEXT   | NULL     | Fee charged by the bridge (string for precision)                  |
| `network_fee`                    | TEXT   | NULL     | Network/gas fee (string for precision)                            |
| `paycrest_fee`                   | TEXT   | NULL     | Fee charged by Paycrest (string for precision)                    |
| `total_fee`                      | TEXT   | NULL     | Sum of all fees (string for precision)                            |

**Constraints:**

- `transactions_status_check`: `status IN ('pending', 'completed', 'failed')`
- `transactions_fee_method_check`: `fee_method IS NULL OR fee_method IN ('native', 'stablecoin')`

---

### `idempotency_keys`

**Migration:** `003_create_idempotency_keys.sql`

Stores idempotency records to ensure that retried API requests do not result in duplicate transactions.

| Column             | Type    | Nullable | Description                                                                 |
| ------------------ | ------- | -------- | --------------------------------------------------------------------------- |
| `idempotency_key`  | TEXT    | NOT NULL | Client-supplied idempotency key                                             |
| `method`           | TEXT    | NOT NULL | HTTP method of the original request                                         |
| `path`             | TEXT    | NOT NULL | URL path of the original request                                            |
| `request_hash`     | TEXT    | NOT NULL | SHA-256 hash of the request body (detects changed payloads)                 |
| `status`           | TEXT    | NOT NULL | `processing` or `completed`                                                 |
| `status_code`      | INTEGER | NULL     | HTTP status code of the cached response                                     |
| `response_body`    | JSONB   | NULL     | Cached response body                                                        |
| `response_headers` | JSONB   | NULL     | Cached response headers                                                     |
| `locked_until`     | BIGINT  | NULL     | Unix timestamp (ms) — row is locked for concurrent requests until this time |
| `created_at`       | BIGINT  | NOT NULL | Unix timestamp (ms) of record creation                                      |
| `updated_at`       | BIGINT  | NOT NULL | Unix timestamp (ms) of last update                                          |
| `expires_at`       | BIGINT  | NOT NULL | Unix timestamp (ms) — record is eligible for cleanup after this time        |

**Primary Key:** `(idempotency_key, method, path)`

---

### `transaction_notification_preferences`

**Migration:** `004_create_transaction_notifications.sql`

Stores each user's notification channel preferences.

| Column                | Type    | Nullable | Description                                             |
| --------------------- | ------- | -------- | ------------------------------------------------------- |
| `user_address`        | TEXT    | NOT NULL | Primary key — Stellar wallet address                    |
| `email`               | TEXT    | NULL     | User's email address                                    |
| `phone_number`        | TEXT    | NULL     | User's phone number for SMS                             |
| `email_enabled`       | BOOLEAN | NOT NULL | Whether email notifications are enabled (default: TRUE) |
| `sms_enabled`         | BOOLEAN | NOT NULL | Whether SMS notifications are enabled (default: FALSE)  |
| `notify_on_pending`   | BOOLEAN | NOT NULL | Notify when a transaction enters pending state          |
| `notify_on_completed` | BOOLEAN | NOT NULL | Notify when a transaction completes                     |
| `notify_on_failed`    | BOOLEAN | NOT NULL | Notify when a transaction fails                         |
| `created_at`          | BIGINT  | NOT NULL | Unix timestamp (ms) of record creation                  |
| `updated_at`          | BIGINT  | NOT NULL | Unix timestamp (ms) of last update                      |

---

### `transaction_notification_deliveries`

**Migration:** `004_create_transaction_notifications.sql`

Tracks every notification delivery attempt.

| Column                | Type    | Nullable | Description                                         |
| --------------------- | ------- | -------- | --------------------------------------------------- |
| `id`                  | TEXT    | NOT NULL | Primary key                                         |
| `transaction_id`      | TEXT    | NOT NULL | Associated transaction ID                           |
| `user_address`        | TEXT    | NOT NULL | Recipient's wallet address                          |
| `event_type`          | TEXT    | NOT NULL | Triggering event type (e.g., `completed`, `failed`) |
| `channel`             | TEXT    | NOT NULL | Delivery channel: `email` or `sms`                  |
| `destination`         | TEXT    | NULL     | Email address or phone number used for delivery     |
| `status`              | TEXT    | NOT NULL | Delivery outcome: `sent`, `failed`, `skipped`       |
| `template_id`         | TEXT    | NOT NULL | Notification template identifier                    |
| `subject`             | TEXT    | NULL     | Email subject line                                  |
| `message`             | TEXT    | NOT NULL | Notification body text                              |
| `provider_message_id` | TEXT    | NULL     | ID returned by the delivery provider                |
| `error_message`       | TEXT    | NULL     | Error detail if delivery failed                     |
| `attempt_count`       | INTEGER | NOT NULL | Number of delivery attempts (default: 1)            |
| `metadata`            | JSONB   | NULL     | Provider-specific metadata                          |
| `created_at`          | BIGINT  | NOT NULL | Unix timestamp (ms) of record creation              |
| `updated_at`          | BIGINT  | NOT NULL | Unix timestamp (ms) of last update                  |
| `sent_at`             | BIGINT  | NULL     | Unix timestamp (ms) of successful delivery          |

---

### `api_keys`

**Migration:** `005_create_api_keys.sql`

Manages programmatic API keys for third-party integrations.

| Column                    | Type    | Nullable | Description                                                  |
| ------------------------- | ------- | -------- | ------------------------------------------------------------ |
| `id`                      | TEXT    | NOT NULL | Primary key                                                  |
| `name`                    | TEXT    | NOT NULL | Human-readable label for the key                             |
| `key_prefix`              | TEXT    | NOT NULL | First 8 characters of the plaintext key (for identification) |
| `key_hash`                | TEXT    | NOT NULL | SHA-256 hash of the full key (UNIQUE)                        |
| `status`                  | TEXT    | NOT NULL | Key lifecycle state: `active`, `rotated`, `revoked`          |
| `rate_limit_max_requests` | INTEGER | NOT NULL | Maximum requests per window (default: 60)                    |
| `rate_limit_window_ms`    | INTEGER | NOT NULL | Rate limit window in ms (default: 60,000)                    |
| `usage_count`             | BIGINT  | NOT NULL | Cumulative request count                                     |
| `last_used_at`            | BIGINT  | NULL     | Unix timestamp (ms) of last successful request               |
| `last_rotated_at`         | BIGINT  | NULL     | Unix timestamp (ms) of last rotation                         |
| `revoked_at`              | BIGINT  | NULL     | Unix timestamp (ms) of revocation                            |
| `revoked_reason`          | TEXT    | NULL     | Reason for revocation                                        |
| `expires_at`              | BIGINT  | NULL     | Optional expiry timestamp (ms)                               |
| `rotated_from_key_id`     | TEXT    | NULL     | ID of the predecessor key (rotation chain)                   |
| `created_at`              | BIGINT  | NOT NULL | Unix timestamp (ms) of record creation                       |
| `updated_at`              | BIGINT  | NOT NULL | Unix timestamp (ms) of last update                           |

---

### `api_key_usage_events`

**Migration:** `005_create_api_keys.sql`

Audit trail for every API request authenticated with an API key.

| Column        | Type    | Nullable | Description                                           |
| ------------- | ------- | -------- | ----------------------------------------------------- |
| `id`          | TEXT    | NOT NULL | Primary key                                           |
| `api_key_id`  | TEXT    | NOT NULL | Associated API key ID                                 |
| `method`      | TEXT    | NOT NULL | HTTP method used                                      |
| `path`        | TEXT    | NOT NULL | API path accessed                                     |
| `status_code` | INTEGER | NOT NULL | HTTP status code of the response                      |
| `limited`     | BOOLEAN | NOT NULL | Whether the request was rate-limited (default: FALSE) |
| `ip_address`  | TEXT    | NULL     | Client IP address                                     |
| `used_at`     | BIGINT  | NOT NULL | Unix timestamp (ms) of the request                    |
| `metadata`    | JSONB   | NULL     | Additional context                                    |

---

### `transaction_insurance`

**Migration:** `006_add_transaction_insurance.sql`

Tracks insurance policies associated with individual transactions.

| Column            | Type          | Nullable | Description                        |
| ----------------- | ------------- | -------- | ---------------------------------- |
| `id`              | UUID          | NOT NULL | Primary key (auto-generated)       |
| `transaction_id`  | UUID          | NOT NULL | FK → `transactions.id`             |
| `provider`        | VARCHAR(50)   | NOT NULL | Insurance provider name            |
| `premium_amount`  | DECIMAL(20,8) | NOT NULL | Premium paid                       |
| `coverage_amount` | DECIMAL(20,8) | NOT NULL | Maximum covered amount             |
| `status`          | VARCHAR(20)   | NOT NULL | Policy status (default: `pending`) |
| `claim_id`        | VARCHAR(255)  | NULL     | Provider claim reference           |
| `created_at`      | TIMESTAMP     | NULL     | Record creation time               |
| `updated_at`      | TIMESTAMP     | NULL     | Last update time                   |

---

### `transaction_batches`

**Migration:** `007_add_transaction_batching.sql`

Groups multiple transactions into a single batch operation.

| Column            | Type          | Nullable | Description                                   |
| ----------------- | ------------- | -------- | --------------------------------------------- |
| `id`              | UUID          | NOT NULL | Primary key                                   |
| `user_id`         | VARCHAR(255)  | NOT NULL | Wallet address of the batch initiator         |
| `status`          | VARCHAR(20)   | NOT NULL | Batch status (default: `pending`)             |
| `total_amount`    | DECIMAL(20,8) | NOT NULL | Sum of all transaction amounts in the batch   |
| `completed_count` | INT           | NULL     | Number of successfully completed transactions |
| `failed_count`    | INT           | NULL     | Number of failed transactions                 |
| `created_at`      | TIMESTAMP     | NULL     | Record creation time                          |
| `updated_at`      | TIMESTAMP     | NULL     | Last update time                              |

---

### `batch_transactions`

**Migration:** `007_add_transaction_batching.sql`

Junction table linking individual transactions to their parent batch.

| Column           | Type        | Nullable | Description                                                |
| ---------------- | ----------- | -------- | ---------------------------------------------------------- |
| `id`             | UUID        | NOT NULL | Primary key                                                |
| `batch_id`       | UUID        | NOT NULL | FK → `transaction_batches.id`                              |
| `transaction_id` | UUID        | NULL     | FK → `transactions.id` (NULL until transaction is created) |
| `status`         | VARCHAR(20) | NOT NULL | Individual transaction status within the batch             |
| `error_message`  | TEXT        | NULL     | Error detail if this entry failed                          |
| `created_at`     | TIMESTAMP   | NULL     | Record creation time                                       |

---

### `referral_codes`

**Migration:** `008_add_referral_program.sql`

Stores user-generated referral codes for the referral programme.

| Column          | Type          | Nullable | Description                            |
| --------------- | ------------- | -------- | -------------------------------------- |
| `id`            | UUID          | NOT NULL | Primary key                            |
| `user_id`       | VARCHAR(255)  | NOT NULL | Wallet address of the referring user   |
| `code`          | VARCHAR(20)   | NOT NULL | Unique referral code string            |
| `reward_amount` | DECIMAL(20,8) | NOT NULL | Reward issued per successful referral  |
| `claimed_count` | INT           | NULL     | Number of times the code has been used |
| `created_at`    | TIMESTAMP     | NULL     | Record creation time                   |

---

### `referral_rewards`

**Migration:** `008_add_referral_program.sql`

Tracks reward disbursements for successful referrals.

| Column             | Type          | Nullable | Description                         |
| ------------------ | ------------- | -------- | ----------------------------------- |
| `id`               | UUID          | NOT NULL | Primary key                         |
| `referrer_id`      | VARCHAR(255)  | NOT NULL | Wallet address of the referrer      |
| `referred_user_id` | VARCHAR(255)  | NOT NULL | Wallet address of the referred user |
| `referral_code`    | VARCHAR(20)   | NOT NULL | Code that was used                  |
| `reward_amount`    | DECIMAL(20,8) | NOT NULL | Reward amount disbursed             |
| `status`           | VARCHAR(20)   | NOT NULL | Reward status (default: `pending`)  |
| `created_at`       | TIMESTAMP     | NULL     | Record creation time                |

---

### `scheduled_transactions`

**Migration:** `009_add_transaction_scheduling.sql`

Supports future-dated transaction scheduling.

| Column           | Type          | Nullable | Description                                        |
| ---------------- | ------------- | -------- | -------------------------------------------------- |
| `id`             | UUID          | NOT NULL | Primary key                                        |
| `user_id`        | VARCHAR(255)  | NOT NULL | Wallet address of the scheduling user              |
| `amount`         | DECIMAL(20,8) | NOT NULL | Scheduled transaction amount                       |
| `currency`       | VARCHAR(10)   | NOT NULL | Currency code                                      |
| `scheduled_for`  | TIMESTAMP     | NOT NULL | Date and time to execute the transaction           |
| `status`         | VARCHAR(20)   | NOT NULL | Schedule status (default: `scheduled`)             |
| `transaction_id` | UUID          | NULL     | FK → `transactions.id` (populated after execution) |
| `created_at`     | TIMESTAMP     | NULL     | Record creation time                               |
| `updated_at`     | TIMESTAMP     | NULL     | Last update time                                   |

---

### `ip_whitelist`

**Migration:** `012_add_ip_whitelisting.sql`

Allowlisted IP addresses or ranges for per-user API access control.

| Column           | Type    | Nullable | Description                                             |
| ---------------- | ------- | -------- | ------------------------------------------------------- |
| `id`             | TEXT    | NOT NULL | Primary key                                             |
| `user_address`   | TEXT    | NOT NULL | Associated wallet address                               |
| `ip_address`     | TEXT    | NOT NULL | Allowlisted IP address                                  |
| `ip_range_start` | TEXT    | NULL     | Start of an IP range (for CIDR blocks)                  |
| `ip_range_end`   | TEXT    | NULL     | End of an IP range                                      |
| `label`          | TEXT    | NULL     | Human-readable label for this entry                     |
| `is_active`      | BOOLEAN | NOT NULL | Whether the entry is currently enforced (default: TRUE) |
| `created_at`     | BIGINT  | NOT NULL | Unix timestamp (ms) of creation                         |
| `last_used_at`   | BIGINT  | NULL     | Unix timestamp (ms) of last matched request             |

---

### `ip_violations`

**Migration:** `012_add_ip_whitelisting.sql`

Audit log for requests blocked by IP whitelisting.

| Column           | Type   | Nullable | Description                      |
| ---------------- | ------ | -------- | -------------------------------- |
| `id`             | TEXT   | NOT NULL | Primary key                      |
| `user_address`   | TEXT   | NOT NULL | Target wallet address            |
| `ip_address`     | TEXT   | NOT NULL | Requesting IP that was rejected  |
| `violation_type` | TEXT   | NOT NULL | Classification of the violation  |
| `severity`       | TEXT   | NOT NULL | Severity level                   |
| `details`        | TEXT   | NULL     | Additional context               |
| `created_at`     | BIGINT | NOT NULL | Unix timestamp (ms) of violation |

---

### `transaction_disputes`

**Migration:** `010_create_transaction_disputes.sql`

Tracks user disputes for failed or erroneous transactions.

| Column             | Type   | Nullable | Description                               |
| ------------------ | ------ | -------- | ----------------------------------------- |
| `id`               | TEXT   | NOT NULL | Primary key                               |
| `transaction_id`   | TEXT   | NOT NULL | FK → `transactions.id`                    |
| `user_address`     | TEXT   | NOT NULL | Disputing user's wallet address           |
| `reason`           | TEXT   | NOT NULL | Short reason code for the dispute         |
| `description`      | TEXT   | NULL     | Detailed description provided by the user |
| `status`           | TEXT   | NOT NULL | Dispute status (default: `open`)          |
| `created_at`       | BIGINT | NOT NULL | Unix timestamp (ms) of dispute creation   |
| `updated_at`       | BIGINT | NOT NULL | Unix timestamp (ms) of last update        |
| `resolved_at`      | BIGINT | NULL     | Unix timestamp (ms) of resolution         |
| `resolution_notes` | TEXT   | NULL     | Notes from the resolving operator         |

**Constraints:**

- `disputes_status_check`: `status IN ('open', 'in_review', 'resolved', 'rejected')`

---

### `sessions`

**Migration:** `013_add_session_management.sql`

Active user sessions with timeout and refresh token support.

| Column             | Type    | Nullable | Description                                             |
| ------------------ | ------- | -------- | ------------------------------------------------------- |
| `id`               | TEXT    | NOT NULL | Primary key (`session_<timestamp>_<random>`)            |
| `user_address`     | TEXT    | NOT NULL | Associated wallet address                               |
| `token`            | TEXT    | NOT NULL | Session token (32 random bytes, hex-encoded; UNIQUE)    |
| `refresh_token`    | TEXT    | NULL     | Refresh token for extending the session (UNIQUE)        |
| `ip_address`       | TEXT    | NULL     | IP address at session creation                          |
| `user_agent`       | TEXT    | NULL     | Browser/client user-agent string                        |
| `is_active`        | BOOLEAN | NOT NULL | Whether the session is currently active (default: TRUE) |
| `created_at`       | BIGINT  | NOT NULL | Unix timestamp (ms) of session creation                 |
| `expires_at`       | BIGINT  | NOT NULL | Unix timestamp (ms) of session expiry                   |
| `last_activity_at` | BIGINT  | NOT NULL | Unix timestamp (ms) of last request                     |
| `refreshed_at`     | BIGINT  | NULL     | Unix timestamp (ms) of last token refresh               |

---

### `session_revocations`

**Migration:** `013_add_session_management.sql`

Audit trail for all revoked sessions.

| Column         | Type   | Nullable | Description                          |
| -------------- | ------ | -------- | ------------------------------------ |
| `id`           | TEXT   | NOT NULL | Primary key                          |
| `session_id`   | TEXT   | NOT NULL | FK → `sessions.id`                   |
| `user_address` | TEXT   | NOT NULL | Associated wallet address            |
| `reason`       | TEXT   | NULL     | Human-readable reason for revocation |
| `revoked_at`   | BIGINT | NOT NULL | Unix timestamp (ms) of revocation    |

---

### `transaction_signatures`

**Migration:** `014_add_transaction_signing.sql`

Cryptographic signatures over transaction data for non-repudiation.

| Column               | Type    | Nullable | Description                         |
| -------------------- | ------- | -------- | ----------------------------------- |
| `id`                 | TEXT    | NOT NULL | Primary key                         |
| `transaction_id`     | TEXT    | NOT NULL | FK → `transactions.id`              |
| `user_address`       | TEXT    | NOT NULL | Signing wallet address              |
| `signature`          | TEXT    | NOT NULL | Hex-encoded signature               |
| `public_key`         | TEXT    | NOT NULL | Public key used for signing         |
| `algorithm`          | TEXT    | NOT NULL | Signing algorithm (e.g., `ed25519`) |
| `signed_at`          | BIGINT  | NOT NULL | Unix timestamp (ms) of signing      |
| `verified_at`        | BIGINT  | NULL     | Unix timestamp (ms) of verification |
| `is_valid`           | BOOLEAN | NULL     | Verification result                 |
| `verification_error` | TEXT    | NULL     | Error detail if verification failed |

---

### `signature_verification_logs`

**Migration:** `014_add_transaction_signing.sql`

Audit trail for signature verification attempts.

| Column                | Type   | Nullable | Description                                  |
| --------------------- | ------ | -------- | -------------------------------------------- |
| `id`                  | TEXT   | NOT NULL | Primary key                                  |
| `signature_id`        | TEXT   | NOT NULL | FK → `transaction_signatures.id`             |
| `verification_status` | TEXT   | NOT NULL | Outcome: `valid`, `invalid`, `error`         |
| `verified_by`         | TEXT   | NULL     | System component that performed verification |
| `verified_at`         | BIGINT | NOT NULL | Unix timestamp (ms) of verification          |
| `details`             | TEXT   | NULL     | Additional details                           |

---

### `audit_logs`

**Migration:** `015_add_audit_logging.sql`

Comprehensive audit trail for all significant application events.

| Column           | Type   | Nullable | Description                                           |
| ---------------- | ------ | -------- | ----------------------------------------------------- |
| `id`             | TEXT   | NOT NULL | Primary key (`audit_<timestamp>_<random>`)            |
| `user_address`   | TEXT   | NULL     | Acting user's wallet address (NULL for system events) |
| `action_type`    | TEXT   | NOT NULL | Type of action performed                              |
| `resource_type`  | TEXT   | NOT NULL | Type of resource affected                             |
| `resource_id`    | TEXT   | NULL     | ID of the affected resource                           |
| `action_details` | TEXT   | NULL     | JSON-serialised action parameters                     |
| `status`         | TEXT   | NOT NULL | Outcome: `success` or `failure`                       |
| `ip_address`     | TEXT   | NULL     | Client IP address                                     |
| `user_agent`     | TEXT   | NULL     | Client user-agent string                              |
| `session_id`     | TEXT   | NULL     | Associated session ID                                 |
| `created_at`     | BIGINT | NOT NULL | Unix timestamp (ms) of the event                      |

---

### `admin_actions`

**Migration:** `015_add_audit_logging.sql`

Dedicated audit trail for administrator operations.

| Column           | Type   | Nullable | Description                                    |
| ---------------- | ------ | -------- | ---------------------------------------------- |
| `id`             | TEXT   | NOT NULL | Primary key                                    |
| `admin_address`  | TEXT   | NOT NULL | Administrator's wallet address                 |
| `action_type`    | TEXT   | NOT NULL | Type of admin action                           |
| `target_user`    | TEXT   | NULL     | Affected user's wallet address (if applicable) |
| `action_details` | TEXT   | NULL     | Additional context                             |
| `reason`         | TEXT   | NULL     | Justification for the action                   |
| `created_at`     | BIGINT | NOT NULL | Unix timestamp (ms) of the action              |

---

### `audit_log_retention`

**Migration:** `015_add_audit_logging.sql`

Configuration for audit log retention policy.

| Column            | Type    | Nullable | Description                             |
| ----------------- | ------- | -------- | --------------------------------------- |
| `id`              | TEXT    | NOT NULL | Primary key                             |
| `retention_days`  | INTEGER | NOT NULL | Number of days to retain audit logs     |
| `last_cleanup_at` | BIGINT  | NULL     | Unix timestamp (ms) of last cleanup run |
| `created_at`      | BIGINT  | NOT NULL | Unix timestamp (ms) of record creation  |

---

## Indexes

| Index Name                                 | Table                  | Columns                           | Purpose                                    |
| ------------------------------------------ | ---------------------- | --------------------------------- | ------------------------------------------ |
| `idx_transactions_user_address_timestamp`  | `transactions`         | `(user_address, timestamp DESC)`  | Efficient user transaction history queries |
| `idx_transactions_payout_order_id`         | `transactions`         | `(payout_order_id)`               | Webhook lookup by Paycrest order ID        |
| `idx_transactions_timestamp`               | `transactions`         | `(timestamp DESC)`                | Global chronological ordering              |
| `idx_transactions_finalized_at`            | `transactions`         | `(finalized_at DESC)`             | Analytics queries on completion time       |
| `idx_transactions_status`                  | `transactions`         | `(status)`                        | Filter by status                           |
| `idx_transactions_user_status`             | `transactions`         | `(user_address, status)`          | User-scoped status filtering               |
| `idx_idempotency_keys_expires_at`          | `idempotency_keys`     | `(expires_at)`                    | Cleanup of expired records                 |
| `idx_idempotency_keys_status_locked_until` | `idempotency_keys`     | `(status, locked_until)`          | Concurrent request locking                 |
| `idx_api_keys_status`                      | `api_keys`             | `(status, updated_at DESC)`       | Active key lookups                         |
| `idx_api_keys_key_prefix`                  | `api_keys`             | `(key_prefix)`                    | Identification by key prefix               |
| `idx_api_key_usage_events_api_key_id`      | `api_key_usage_events` | `(api_key_id, used_at DESC)`      | Usage history per key                      |
| `idx_sessions_user_address`                | `sessions`             | `(user_address)`                  | Sessions by user                           |
| `idx_sessions_token`                       | `sessions`             | `(token)`                         | Session lookup by token                    |
| `idx_sessions_refresh_token`               | `sessions`             | `(refresh_token)`                 | Refresh token lookup                       |
| `idx_sessions_expires_at`                  | `sessions`             | `(expires_at)`                    | Cleanup of expired sessions                |
| `idx_audit_logs_user_address`              | `audit_logs`           | `(user_address, created_at DESC)` | Audit history per user                     |
| `idx_audit_logs_action_type`               | `audit_logs`           | `(action_type)`                   | Filter by action type                      |
| `idx_audit_logs_created_at`                | `audit_logs`           | `(created_at DESC)`               | Chronological audit queries                |
| `idx_disputes_transaction_id`              | `transaction_disputes` | `(transaction_id)`                | Disputes by transaction                    |
| `idx_disputes_status`                      | `transaction_disputes` | `(status)`                        | Filter open/pending disputes               |

---

## Data Retention Policies

| Data Type                     | Retention Period                         | Notes                                                          |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `transactions`                | Indefinite                               | Core business records; never deleted                           |
| `idempotency_keys`            | 24 hours (configurable via `expires_at`) | Cleaned up by a scheduled job                                  |
| `sessions` (inactive)         | 7 days after expiry                      | Expired sessions are soft-deleted; hard-deleted by cleanup job |
| `audit_logs`                  | 90 days (default)                        | Configurable via `audit_log_retention` table                   |
| `admin_actions`               | 90 days (default)                        | Same retention as `audit_logs`                                 |
| `api_key_usage_events`        | 90 days                                  | Delete events older than 90 days to control table size         |
| `ip_violations`               | 30 days                                  | Short retention — operational monitoring only                  |
| `session_revocations`         | 90 days                                  | Aligned with audit log retention                               |
| `signature_verification_logs` | Indefinite                               | Tied to transaction lifecycle                                  |

**Running Cleanup:**

```sql
-- Expire idempotency keys
DELETE FROM idempotency_keys WHERE expires_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- Remove inactive expired sessions
DELETE FROM sessions WHERE is_active = false AND expires_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 604800000;

-- Purge old audit logs (90 days)
DELETE FROM audit_logs WHERE created_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 7776000000;
```

---

## Backup and Restore Procedures

### Automated Backups

1. **Enable continuous WAL archiving** using pgBackRest or pg_basebackup to an S3-compatible store:

   ```bash
   pg_basebackup -h <host> -U <user> -D /backups/$(date +%Y%m%d) --wal-method=stream
   ```

2. **Schedule daily logical backups** with `pg_dump`:

   ```bash
   pg_dump $DATABASE_URL --format=custom --compress=9 > backup_$(date +%Y%m%d).dump
   ```

3. **Verify backups** weekly by restoring to a test instance:
   ```bash
   pg_restore --clean --if-exists -d postgres://test_db backup_$(date +%Y%m%d).dump
   ```

### Restore Procedure

1. Stop the application to prevent writes during restore.
2. Create a new database instance or drop/recreate the target database.
3. Restore from the most recent backup:
   ```bash
   pg_restore --clean --if-exists -d $DATABASE_URL backup_YYYYMMDD.dump
   ```
4. Re-run all migrations to ensure the schema is current:
   ```bash
   # Apply each migration file in order
   for f in migrations/*.sql; do psql $DATABASE_URL < "$f"; done
   ```
5. Verify row counts and spot-check critical tables.
6. Restart the application.

---

## Migration Guide

Migrations live in `migrations/` and are numbered sequentially. They are **idempotent** — safe to re-run.

### Applying Migrations

Apply migrations in numerical order:

```bash
for f in migrations/*.sql; do
  echo "Applying $f..."
  psql $DATABASE_URL < "$f"
done
```

### Adding a New Migration

1. Create a new file: `migrations/NNN_description.sql` (increment `NNN` from the highest existing number)
2. Use `IF NOT EXISTS` for `CREATE TABLE` and `CREATE INDEX` statements
3. Use `DO $$ BEGIN ... END $$` blocks for conditional `ALTER TABLE` statements
4. Add a header comment:
   ```sql
   -- Migration: NNN_description
   -- Brief description of what this migration does
   -- Idempotent: safe to run multiple times (uses IF NOT EXISTS)
   ```
5. Test the migration against a copy of production data before applying to production
6. Apply using the loop above or your deployment pipeline

### Rolling Back

PostgreSQL DDL statements (`CREATE TABLE`, `ALTER TABLE`) are transactional. Wrap migrations in a transaction to enable rollback:

```sql
BEGIN;

-- Your migration SQL here

-- To roll back, run ROLLBACK instead of COMMIT during testing
COMMIT;
```

For production rollbacks, write an explicit reverse migration script rather than relying on `ROLLBACK`.

---

## Example Queries

### Get a user's transaction history (paginated)

```sql
SELECT id, timestamp, amount, currency, status, beneficiary_currency, total_fee
FROM transactions
WHERE user_address = $1
ORDER BY timestamp DESC
LIMIT 20 OFFSET $2;
```

### Find transactions awaiting payout

```sql
SELECT id, payout_order_id, payout_status, amount, beneficiary_currency
FROM transactions
WHERE status = 'pending'
  AND payout_order_id IS NOT NULL
  AND payout_status NOT IN ('settled', 'failed')
ORDER BY timestamp ASC;
```

### API key usage summary for the last 24 hours

```sql
SELECT
  ak.name,
  ak.key_prefix,
  COUNT(*) AS total_requests,
  COUNT(*) FILTER (WHERE ue.limited = true) AS rate_limited,
  COUNT(*) FILTER (WHERE ue.status_code >= 500) AS server_errors
FROM api_key_usage_events ue
JOIN api_keys ak ON ak.id = ue.api_key_id
WHERE ue.used_at > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 86400000
GROUP BY ak.id, ak.name, ak.key_prefix
ORDER BY total_requests DESC;
```

### Active sessions per user

```sql
SELECT user_address, COUNT(*) AS active_sessions
FROM sessions
WHERE is_active = true AND expires_at > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
GROUP BY user_address
ORDER BY active_sessions DESC;
```

### Open disputes

```sql
SELECT td.id, td.transaction_id, td.user_address, td.reason, td.created_at
FROM transaction_disputes td
WHERE td.status IN ('open', 'in_review')
ORDER BY td.created_at ASC;
```

---

## Query Optimisation Strategies

1. **Use indexed columns in WHERE clauses.** The most common query patterns (`user_address`, `status`, `timestamp`) are all indexed. Avoid `SELECT *` with no `WHERE` clause on large tables.

2. **Use `EXPLAIN ANALYSE`** before adding new queries to production:

   ```sql
   EXPLAIN ANALYSE SELECT * FROM transactions WHERE user_address = 'G...' ORDER BY timestamp DESC LIMIT 20;
   ```

3. **Prefer composite indexes for multi-column filters.** `idx_transactions_user_address_timestamp` covers both `user_address` and `timestamp DESC`, which is more efficient than two separate index scans.

4. **Paginate large result sets.** Always use `LIMIT` and `OFFSET` (or keyset pagination) for queries that may return many rows.

5. **Archive or partition old data.** The `transactions` table will grow unboundedly. Consider range-partitioning by `timestamp` year or month once the table exceeds 10 million rows.

6. **Monitor slow queries.** Enable `log_min_duration_statement = 500` in PostgreSQL config to log queries taking more than 500ms. Review these regularly.

7. **Use connection pooling.** The application uses the `pg` connection pool. Configure `max` connections based on your PostgreSQL `max_connections` setting (typically `max_connections / 2` for the application pool).

8. **Avoid `SELECT *` in production queries.** Fetch only the columns you need to reduce network and memory overhead.

---

## New Tables (Migrations 017–019)

### `onramp_transactions`

**Migration:** `020_create_onramp_transactions.sql`

Stores on-ramp transactions (fiat → stablecoin to Stellar). Counterpart to `transactions` (off-ramp).

| Column                | Type             | Nullable | Description                                            |
| --------------------- | ---------------- | -------- | ------------------------------------------------------ |
| `id`                  | TEXT             | NOT NULL | Primary key                                            |
| `quote_id`            | TEXT             | NOT NULL | Quote reference from the on-ramp provider              |
| `state`               | TEXT             | NOT NULL | Lifecycle state (default: `draft`)                     |
| `fiat_amount`         | TEXT             | NOT NULL | Fiat input amount                                      |
| `fiat_currency`       | TEXT             | NOT NULL | Fiat input currency (e.g., `NGN`)                      |
| `destination_amount`  | TEXT             | NOT NULL | Expected stablecoin output amount                      |
| `destination_token`   | TEXT             | NOT NULL | Destination token symbol (e.g., `USDC`)                |
| `destination_address` | TEXT             | NOT NULL | Stellar wallet address to receive the stablecoin       |
| `destination_network` | TEXT             | NOT NULL | Target network (default: `stellar`)                    |
| `provider`            | TEXT             | NOT NULL | On-ramp provider identifier                            |
| `provider_order_id`   | TEXT             | NULL     | Provider-assigned order ID                             |
| `rate`                | DOUBLE PRECISION | NOT NULL | Exchange rate applied                                  |
| `deposit_address`     | TEXT             | NULL     | Address the user sends fiat to                         |
| `deposit_network`     | TEXT             | NULL     | Network for fiat deposit                               |
| `deposit_amount`      | TEXT             | NULL     | Amount the user should deposit                         |
| `deposit_token`       | TEXT             | NULL     | Token/currency for deposit                             |
| `bridge_tx_hash`      | TEXT             | NULL     | Bridge transaction hash (if a bridge step is involved) |
| `bridge_status`       | TEXT             | NULL     | Bridge transfer status                                 |
| `error`               | TEXT             | NULL     | Error message if the transaction failed                |
| `created_at`          | BIGINT           | NOT NULL | Unix timestamp (ms) of creation                        |
| `updated_at`          | BIGINT           | NOT NULL | Unix timestamp (ms) of last update                     |
| `expires_at`          | BIGINT           | NULL     | Unix timestamp (ms) of quote expiry                    |

**Valid `state` values:** `draft`, `quoted`, `order_created`, `deposit_pending`, `deposit_confirmed`, `bridge_pending`, `bridge_completed`, `completed`, `failed`, `expired`

---

### `webhook_subscriptions`

**Migration:** `019_create_webhook_subscriptions.sql`

Manages outbound webhook endpoints registered by integrators.

| Column                      | Type    | Nullable | Description                                     |
| --------------------------- | ------- | -------- | ----------------------------------------------- |
| `id`                        | TEXT    | NOT NULL | Primary key                                     |
| `endpoint_url`              | TEXT    | NOT NULL | Target URL for webhook delivery                 |
| `signing_secret`            | TEXT    | NOT NULL | HMAC secret for payload signing                 |
| `events`                    | JSONB   | NOT NULL | Array of subscribed event types (default: `[]`) |
| `status`                    | TEXT    | NOT NULL | Subscription status (default: `active`)         |
| `rate_limit_max_per_minute` | INTEGER | NOT NULL | Max deliveries per minute (default: 60)         |
| `description`               | TEXT    | NULL     | Human-readable description                      |
| `created_at`                | BIGINT  | NOT NULL | Unix timestamp (ms) of creation                 |
| `updated_at`                | BIGINT  | NOT NULL | Unix timestamp (ms) of last update              |

---

### `webhook_delivery_logs`

**Migration:** `019_create_webhook_subscriptions.sql`

Audit trail for every webhook delivery attempt.

| Column            | Type    | Nullable | Description                                  |
| ----------------- | ------- | -------- | -------------------------------------------- |
| `id`              | TEXT    | NOT NULL | Primary key                                  |
| `subscription_id` | TEXT    | NOT NULL | FK → `webhook_subscriptions.id`              |
| `event`           | TEXT    | NOT NULL | Event type that triggered this delivery      |
| `payload_url`     | TEXT    | NOT NULL | Endpoint URL used for this attempt           |
| `request_body`    | TEXT    | NOT NULL | Serialised request payload                   |
| `response_status` | INTEGER | NULL     | HTTP status code returned by the endpoint    |
| `response_body`   | TEXT    | NULL     | Response body (truncated to 4 KB)            |
| `duration_ms`     | BIGINT  | NOT NULL | Delivery round-trip duration in milliseconds |
| `status`          | TEXT    | NOT NULL | Delivery outcome: `success` or `failed`      |
| `attempt_count`   | INTEGER | NOT NULL | Number of delivery attempts (default: 1)     |
| `created_at`      | BIGINT  | NOT NULL | Unix timestamp (ms) of delivery attempt      |

---

### `ledger_accounts`

**Migration:** `021_create_ledger_tables.sql`

Chart of accounts for the double-entry internal ledger.

| Column        | Type   | Nullable | Description                                                        |
| ------------- | ------ | -------- | ------------------------------------------------------------------ |
| `id`          | TEXT   | NOT NULL | Primary key                                                        |
| `code`        | TEXT   | NOT NULL | Unique account code (UNIQUE)                                       |
| `name`        | TEXT   | NOT NULL | Human-readable account name                                        |
| `type`        | TEXT   | NOT NULL | Account type: `asset`, `liability`, `equity`, `revenue`, `expense` |
| `category`    | TEXT   | NOT NULL | Functional category (e.g., `bridge_fees`, `treasury`)              |
| `description` | TEXT   | NULL     | Optional description                                               |
| `created_at`  | BIGINT | NOT NULL | Unix timestamp (ms) of creation                                    |
| `updated_at`  | BIGINT | NOT NULL | Unix timestamp (ms) of last update                                 |

---

### `ledger_entries`

**Migration:** `021_create_ledger_tables.sql`

Individual debit/credit entries in the double-entry ledger.

| Column           | Type   | Nullable | Description                                      |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `id`             | TEXT   | NOT NULL | Primary key                                      |
| `transaction_id` | TEXT   | NULL     | Associated transaction ID (if applicable)        |
| `account_id`     | TEXT   | NOT NULL | FK → `ledger_accounts.id`                        |
| `entry_type`     | TEXT   | NOT NULL | `debit` or `credit`                              |
| `amount`         | TEXT   | NOT NULL | Entry amount (string for precision)              |
| `currency`       | TEXT   | NOT NULL | Currency code (default: `USD`)                   |
| `description`    | TEXT   | NULL     | Entry description                                |
| `reference_type` | TEXT   | NULL     | Type of source document (e.g., `offramp`, `fee`) |
| `reference_id`   | TEXT   | NULL     | ID of the source document                        |
| `entry_hash`     | TEXT   | NOT NULL | Deterministic hash for deduplication (UNIQUE)    |
| `created_at`     | BIGINT | NOT NULL | Unix timestamp (ms) of creation                  |

---

### `ledger_reconciliation`

**Migration:** `021_create_ledger_tables.sql`

Records reconciliation results comparing external reports to the internal ledger.

| Column             | Type   | Nullable | Description                                    |
| ------------------ | ------ | -------- | ---------------------------------------------- |
| `id`               | TEXT   | NOT NULL | Primary key                                    |
| `report_id`        | TEXT   | NOT NULL | External report reference                      |
| `account_id`       | TEXT   | NOT NULL | FK → `ledger_accounts.id`                      |
| `reported_balance` | TEXT   | NOT NULL | Balance as reported by external source         |
| `ledger_balance`   | TEXT   | NOT NULL | Balance as computed from `ledger_entries`      |
| `difference`       | TEXT   | NOT NULL | `reported_balance - ledger_balance`            |
| `status`           | TEXT   | NOT NULL | `unreconciled`, `reconciled`, or `discrepancy` |
| `reconciled_at`    | BIGINT | NULL     | Unix timestamp (ms) of reconciliation          |
| `notes`            | TEXT   | NULL     | Operator notes                                 |
| `created_at`       | BIGINT | NOT NULL | Unix timestamp (ms) of record creation         |

---

### `multisig_proposals`

**Migration:** `022_add_multisig_settlement.sql`

Multi-signer governance proposals for admin/settlement operations.

| Column        | Type          | Nullable | Description                                             |
| ------------- | ------------- | -------- | ------------------------------------------------------- |
| `id`          | TEXT          | NOT NULL | Primary key                                             |
| `description` | TEXT          | NOT NULL | Human-readable description of the proposed action       |
| `target`      | TEXT          | NOT NULL | Target address or resource for the proposal             |
| `value`       | NUMERIC(36,0) | NOT NULL | Amount or parameter value                               |
| `executed`    | BOOLEAN       | NOT NULL | Whether the proposal has been executed (default: FALSE) |
| `executed_by` | TEXT          | NULL     | Address of the signer who executed the proposal         |
| `executed_at` | BIGINT        | NULL     | Unix timestamp (ms) of execution                        |
| `created_at`  | BIGINT        | NOT NULL | Unix timestamp (ms) of proposal creation                |
| `expires_at`  | BIGINT        | NOT NULL | Unix timestamp (ms) after which the proposal is void    |

---

### `multisig_signatures`

**Migration:** `022_add_multisig_settlement.sql`

Partial signatures collected for multi-sig proposals.

| Column        | Type   | Nullable | Description                               |
| ------------- | ------ | -------- | ----------------------------------------- |
| `id`          | TEXT   | NOT NULL | Primary key                               |
| `proposal_id` | TEXT   | NOT NULL | FK → `multisig_proposals.id`              |
| `signer`      | TEXT   | NOT NULL | Signing authority's address               |
| `signature`   | TEXT   | NOT NULL | Cryptographic signature over the proposal |
| `signed_at`   | BIGINT | NOT NULL | Unix timestamp (ms) of signing            |

**Constraint:** UNIQUE `(proposal_id, signer)` — one signature per signer per proposal.

---

## Migration History

| #   | File                                       | Tables Affected                                                               | Date Applied |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------- | ------------ |
| 001 | `001_create_transactions.sql`              | `transactions`                                                                | Initial      |
| 002 | `002_add_transaction_analytics_fields.sql` | `transactions` (alter)                                                        | —            |
| 003 | `003_create_idempotency_keys.sql`          | `idempotency_keys`                                                            | —            |
| 004 | `004_create_transaction_notifications.sql` | `transaction_notification_preferences`, `transaction_notification_deliveries` | —            |
| 005 | `005_create_api_keys.sql`                  | `api_keys`, `api_key_usage_events`                                            | —            |
| 006 | `006_add_transaction_insurance.sql`        | `transaction_insurance`                                                       | —            |
| 007 | `007_add_transaction_batching.sql`         | `transaction_batches`, `batch_transactions`                                   | —            |
| 008 | `008_add_referral_program.sql`             | `referral_codes`, `referral_rewards`                                          | —            |
| 009 | `009_add_transaction_scheduling.sql`       | `scheduled_transactions`                                                      | —            |
| 010 | `010_create_transaction_disputes.sql`      | `transaction_disputes`                                                        | —            |
| 011 | `011_add_query_indexes.sql`                | (indexes only)                                                                | —            |
| 012 | `012_add_ip_whitelisting.sql`              | `ip_whitelist`, `ip_violations`                                               | —            |
| 013 | `013_add_session_management.sql`           | `sessions`, `session_revocations`                                             | —            |
| 014 | `014_add_transaction_signing.sql`          | `transaction_signatures`, `signature_verification_logs`                       | —            |
| 015 | `015_add_audit_logging.sql`                | `audit_logs`, `admin_actions`, `audit_log_retention`                          | —            |
| 016 | `016_add_api_key_scopes.sql`               | `api_keys` (alter — scopes column)                                            | —            |
| 017 | `017_enhance_audit_logging.sql`            | `api_key_usage_logs`, `sensitive_data_access_logs`                            | —            |
| 018 | `018_optimize_database_queries.sql`        | (indexes + statistics only)                                                   | —            |
| 019 | `019_create_webhook_subscriptions.sql`     | `webhook_subscriptions`, `webhook_delivery_logs`                              | —            |
| 020 | `020_create_onramp_transactions.sql`       | `onramp_transactions`                                                         | —            |
| 021 | `021_create_ledger_tables.sql`             | `ledger_accounts`, `ledger_entries`, `ledger_reconciliation`                  | —            |
| 022 | `022_add_multisig_settlement.sql`          | `multisig_proposals`, `multisig_signatures`                                   | —            |

> Note (#788): `010`, `017`, and `021` previously each had multiple files sharing the same prefix. They've been renumbered sequentially (`010`–`026`) based on actual git commit history order; see `migrations/README.md` for the full before/after mapping.

---

## Related Documentation

- [Security Best Practices](./security-best-practices.md)
- [Monitoring & Observability](./monitoring.md)
- [Backup & Recovery](./backup-recovery.md)
- [Database Optimisation](./database-optimization.md)
- [Environment Variables](./environment-variables.md)
