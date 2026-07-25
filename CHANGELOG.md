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

### Removed

- Removed leftover root-level PR scratch files (`PR_DESCRIPTION.md`,
  `PR_DESCRIPTION_674.md`, `PR_DESCRIPTION_676.md`); their still-relevant content is
  preserved in this changelog. A `.gitignore` rule now prevents `PR_DESCRIPTION*.md`
  files from being committed to the repository root. (#755)
