# Changelog

All notable changes to Stellar-Spend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Operations runbook library** (`docs/runbooks/`) — master index with runbook
  template, escalation matrix, comms templates and post-incident-review process,
  plus runbooks for stuck bridge transactions, provider outages, database
  failover, high error rates and backup failures. Every critical/warning alert in
  `docs/monitoring.md` now links to a matching runbook. (#661)
- **Compliance & regulatory notice framework** (`docs/compliance-regulatory.md`) —
  KYC tiers and limits, KYC lifecycle and audit trail, AML screening risk levels,
  per-corridor regulatory notices (Nigeria/NGN, Kenya/KES, Ghana/GHS), GDPR/local
  data-handling and retention, and a user-facing compliance FAQ. (#662)
- **Data model & schema reference** (`docs/database-schema.md`) — ASCII ER diagram,
  column-level documentation for all tables across migrations 001–019, index
  catalogue, migration history and per-table data-retention policies. (#663)
- **Stellar/Soroban developer handbook** (`docs/stellar-soroban-handbook.md`) —
  network selection, wallet connection patterns, XDR building/signing, Horizon vs
  Soroban RPC, fee estimation, full contract-invocation flow, multi-sig settlement,
  common pitfalls and copy-paste examples. (#664)
- **Structured logging test coverage** — `src/lib/logger.test.ts` adds 18 tests
  covering secret/PII redaction, nested/array redaction, depth limiting, log-entry
  structure, `withContext` binding and log-level filtering. (#676)
- **Dependency-injection service interfaces** — explicit interfaces for all 13
  application services and a `wrapper-services.ts` layer so function-based services
  integrate cleanly with the DI container. (#674)
- **`openapi.yaml` coverage for `/api/auth/2fa/{manage,recovery,backup-codes,enforcement}`**
  — audited `src/app/api/auth` for routes with no client (#786). These four aren't
  stale/superseded endpoints (there's no old-vs-new pair to retire); they're real,
  working 2FA account-management functionality shipped alongside `setup`/`verify`
  in #504 but never wired to a frontend or documented. Left in place and documented
  rather than deleted.

### Changed

- **Dependency-injection container** (`src/lib/di/`) — replaced the ad-hoc singleton
  pattern and legacy `ServiceContainer` with a unified `DIContainer` as the single
  wiring point. `configureServices()` now registers all 13 services, routes resolve
  services exclusively through the container, and `registerOverride()` /
  `overrideService()` enable clean test mocks. (#674)
- **Centralized logging** (`src/lib/logger.ts`) — all application logging now routes
  through the structured logger with correlation IDs (`requestId` propagated via
  middleware) and centralized PII/secret redaction (SSN, credit card, CVV, routing
  number patterns; expanded `REDACT_KEYS`). Raw `console.*` usage is removed and
  lint-enforced via `no-console: error`, with log level configurable through the
  `LOG_LEVEL` env var. (#676)
- **Fixed request-id correlation** — root `middleware.ts` generated a correlation ID
  and logged it for the top-level `http.request` line, but never wrote it back into
  the request headers a route handler receives, so `logger.withContext({requestId})`
  calls inside a route picked up a different (or no) ID than the one already logged
  for that request. The resolved ID is now forwarded via
  `NextResponse.next({request: {headers}})` so route-level logs actually correlate
  with the request that produced them. (#785)
- **Standardized API error response format** (`src/lib/error-handler.ts`,
  `src/lib/error-types.ts`) — routes previously returned errors as bespoke
  `NextResponse.json({error}/{message}/...)` shapes, or one of two different
  half-adopted "standard error" systems. All ~150 routes under `src/app/api` now
  return the same `{error, message?, details?}` envelope via a single `ErrorHandler`,
  documented in `openapi.yaml`. Added a typed `ApiError` so a route can raise an
  exact code/status/details instead of `ErrorHandler` guessing from message text.
  (#783)

### Removed

- Removed leftover root-level PR scratch files (`PR_DESCRIPTION.md`,
  `PR_DESCRIPTION_674.md`, `PR_DESCRIPTION_676.md`); their still-relevant content is
  preserved in this changelog. A `.gitignore` rule now prevents `PR_DESCRIPTION*.md`
  files from being committed to the repository root. (#755)
- **Two unused, competing error-handling implementations** — `src/lib/errors/*`
  (an `ApplicationError` class hierarchy + middleware) and
  `src/lib/error-migration-helpers.ts`, both with zero call sites anywhere in
  `src/`, fully superseded by the now-standardized `ErrorHandler`. (#783)
- **`src/lib/middleware/request-logging.middleware.ts`** — a second, unused
  per-handler request-logging wrapper duplicating what root `middleware.ts`
  already does globally; zero call sites anywhere in `src/`. (#785)
- **`migrations/001_initial_schema.sql` and `002_add_balance.sql`** — a dead
  `users`/`transactions` schema (UUID ids, `DECIMAL` amounts) from an early
  prototype, unreferenced anywhere in `src/`, superseded by
  `001_create_transactions.sql`/`002_add_transaction_analytics_fields.sql` (the
  `TEXT`-id, Stellar-native schema every route and repository actually uses). No
  duplicate migration-number prefixes remain in `migrations/`. (#784)
