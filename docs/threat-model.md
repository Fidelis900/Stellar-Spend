# Stellar-Spend Threat Model

**Version:** 2.0
**Date:** 2026-06-28
**Status:** Living document — review before each mainnet deployment and after every significant
architectural change.
**Author:** Security lead + contributors (see §9)

---

## 1. Scope

This threat model covers the complete Stellar-Spend off-ramp **and** on-ramp data flow:

| Component                                                                           | In scope |
| ----------------------------------------------------------------------------------- | -------- |
| Next.js API server (bridge, payout, webhook, health routes)                         | ✅       |
| Soroban smart contracts (`escrow`, `treasury`, `fee-manager`, `multisig-authority`) | ✅       |
| Browser frontend (wallet interaction, localStorage, service worker)                 | ✅       |
| CI/CD pipeline (GitHub Actions, container registry, Terraform)                      | ✅       |
| On-ramp provider registry (ADR-007)                                                 | ✅       |
| Field-level PII encryption layer (`src/lib/security/`, repositories)                | ✅       |
| Key Management System (KMS) integration for envelope encryption                     | ✅       |
| PostgreSQL database (PII columns, audit logs)                                       | ✅       |

**Out of scope:** Allbridge Protocol internals, Paycrest backend, Stellar/Base consensus layers,
user's own wallet key management.

---

## 2. Assets

| Asset                                          | C        | I        | A      | Notes                                |
| ---------------------------------------------- | -------- | -------- | ------ | ------------------------------------ |
| `BASE_PRIVATE_KEY` — payout wallet             | Critical | Critical | High   | Server-only; never in browser bundle |
| `PAYCREST_API_KEY` / `PAYCREST_WEBHOOK_SECRET` | High     | High     | Medium | HMAC signing + webhook validation    |
| `ENCRYPTION_KEY` / KMS key ARN                 | Critical | Critical | High   | #692 field-level encryption key      |
| `DATABASE_URL`                                 | High     | High     | High   |                                      |
| Beneficiary bank account + name (PII)          | High     | High     | Medium | Encrypted at field level (#692)      |
| Escrow contract settlement authority           | Critical | Critical | High   | Multi-sig required (#629)            |
| User stablecoin funds (in-flight)              | N/A      | Critical | High   | Non-custodial; server never holds    |
| Transaction history (localStorage)             | Medium   | Medium   | Low    | No private keys stored               |
| On-ramp provider API keys                      | High     | High     | Medium | Per-provider credential isolation    |
| CI/CD secrets (registry, deploy tokens)        | High     | High     | Medium | Scoped per environment               |
| Audit log records                              | Medium   | High     | Medium | Integrity-critical for compliance    |

---

## 3. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (untrusted)                                        │
│   • User wallet (Freighter / Lobstr)                        │
│   • localStorage (transaction history, no secrets)          │
│   • Potential malicious extensions                          │
└───────────────────────────┬─────────────────────────────────┘
                            │  TLS
┌───────────────────────────▼─────────────────────────────────┐
│  Next.js API Server (trusted)                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Application layer                                  │   │
│   │   • /api/offramp/*   (bridge, quote, payout)        │   │
│   │   • /api/onramp/*    (provider registry)            │   │
│   │   • /api/webhooks/*  (Paycrest, HMAC-verified)      │   │
│   │   • /api/health                                     │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  Security layer (src/lib/security/)                 │   │
│   │   • Field-level encryption (AES-256-GCM)           │   │
│   │   • Sanitization, rate limiting, CORS               │   │
│   └─────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Repository layer (src/lib/repositories/)           │   │
│   │   Transparent encrypt/decrypt on PII fields         │   │
│   └─────────────────────────────────────────────────────┘   │
└──┬──────────────────────────────────┬────────────────────────┘
   │ TLS                              │ TLS
   ▼                                  ▼
[Paycrest API]                  [Base Chain RPC]
   │  HMAC-signed
   │  webhook
   └──────────────────────────────────────────────────────────▶
                                                    [PostgreSQL]
[Stellar Horizon / Soroban RPC]          (PII encrypted at field level)

[GitHub Actions] ──▶ [Container Registry] ──▶ [Production K8s/Cloud]
                                  ▲
                          [KMS — envelope key]
```

---

## 4. Actors

| Actor                       | Trust Level | Notes                                                  |
| --------------------------- | ----------- | ------------------------------------------------------ |
| Authenticated user          | Low–Medium  | Controls wallet; crafts inputs; no server-side session |
| Paycrest webhook sender     | Medium      | HMAC-SHA512 verified; IP allowlist recommended         |
| On-ramp provider API        | Medium      | Per-credential isolation; no cross-provider privilege  |
| CI/CD pipeline              | High        | Has deploy credentials; supply-chain risk              |
| Database administrator      | High        | Full plaintext access to unencrypted columns           |
| KMS service (AWS/GCP)       | Trusted     | Key custodian for envelope encryption                  |
| External auditor            | High        | Read-only code + staging access                        |
| Malicious browser extension | None        | May intercept wallet interactions                      |
| Contract attacker           | None        | May probe escrow for replay/reentrancy                 |
| Insider threat              | Elevated    | Has credential access; mitigated by audit logs         |

---

## 5. Attack Surfaces & Full STRIDE Analysis

### 5.1 API Layer

| ID   | Threat                                            | STRIDE                 | Severity | Mitigation                                                          | Status          |
| ---- | ------------------------------------------------- | ---------------------- | -------- | ------------------------------------------------------------------- | --------------- |
| A-01 | Forged Paycrest webhook                           | Spoofing               | High     | HMAC-SHA512 + constant-time compare; reject on mismatch             | ✅ Implemented  |
| A-02 | Replay a payout request                           | Repudiation            | High     | Idempotency keys (`src/lib/idempotency.ts`)                         | ✅ Implemented  |
| A-03 | SQL injection via bank details                    | Tampering              | Critical | Parameterized queries only; no string interpolation                 | ✅ Implemented  |
| A-04 | DoS via quote/payout hammering                    | Denial of Service      | High     | Rate limiting: 30 req/min (quote), 10 req/min (payout)              | ✅ Implemented  |
| A-05 | `BASE_PRIVATE_KEY` leaked in logs                 | Information Disclosure | Critical | No key logging; Sentry PII scrubbing; `encryptLogEntry`             | ✅ Implemented  |
| A-06 | API key privilege escalation                      | Elevation of Privilege | High     | Scoped API keys with per-route enforcement                          | ✅ Implemented  |
| A-07 | PII in plaintext in DB                            | Information Disclosure | High     | Field-level encryption on `accountIdentifier`, `accountName` (#692) | ✅ Implemented  |
| A-08 | PII leaked in server logs                         | Information Disclosure | High     | Logger masks `accountIdentifier`, `accountName` fields              | ✅ Implemented  |
| A-09 | Key rotation causing data loss                    | Tampering / DoS        | High     | Envelope encryption + re-encrypt migration (#692)                   | ✅ Implemented  |
| A-10 | On-ramp provider credential cross-contamination   | Elevation of Privilege | Medium   | Per-provider credential objects; no shared key                      | ✅ By design    |
| A-11 | SSRF via provider callback URL                    | Tampering              | Medium   | URL validation + allowlist for provider webhooks                    | ⚠️ Gap — TM-005 |
| A-12 | Unvalidated redirect in OAuth-style on-ramp flows | Tampering              | Medium   | Validate `returnUrl` against origin allowlist                       | ⚠️ Gap — TM-006 |

### 5.2 Smart Contracts (Soroban)

| ID   | Threat                                 | STRIDE         | Severity | Mitigation                                                        | Status              |
| ---- | -------------------------------------- | -------------- | -------- | ----------------------------------------------------------------- | ------------------- |
| C-01 | Unauthorized escrow release            | Spoofing / EoP | Critical | `settlement_auth.require_auth()` before state change              | ✅ Implemented      |
| C-02 | Double-release / double-refund         | Tampering      | Critical | Boolean guards (`released`, `refunded`) checked first             | ✅ Implemented      |
| C-03 | Fund lock via missing timeout          | DoS            | High     | `can_refund` available to depositor after `timeout_ledger`        | ✅ Implemented      |
| C-04 | Reentrancy during release              | Tampering      | High     | Soroban execution model is atomic; no mid-function external calls | ✅ By platform      |
| C-05 | Upgrade to malicious WASM              | Tampering      | Critical | Multi-sig required for upgrade authority                          | ✅ Addressed (#629) |
| C-06 | Integer overflow on amount             | Tampering      | High     | `i128` arithmetic; `amount > 0` validated                         | ✅ Implemented      |
| C-07 | Front-running on escrow release timing | Tampering      | Medium   | Settlement address is fixed at deposit time                       | ✅ By design        |
| C-08 | Fee manager manipulation               | Tampering      | High     | Fee rates controlled by admin multi-sig                           | ✅ Addressed (#629) |

### 5.3 Frontend / Wallet

| ID   | Threat                                   | STRIDE                 | Severity | Mitigation                                                    | Status          |
| ---- | ---------------------------------------- | ---------------------- | -------- | ------------------------------------------------------------- | --------------- |
| F-01 | XSS via user-supplied content            | Tampering              | High     | `isomorphic-dompurify`; strict CSP                            | ✅ Implemented  |
| F-02 | `localStorage` private key exfiltration  | Information Disclosure | Critical | Never store private keys in localStorage (enforced by design) | ✅ Implemented  |
| F-03 | Wallet phishing / prompt hijacking       | Spoofing               | High     | Display human-readable XDR summary before signing             | ✅ Implemented  |
| F-04 | MITM on RPC endpoint                     | Tampering              | High     | RPC URLs pinned in env; TLS-only providers                    | ✅ Implemented  |
| F-05 | Malicious service worker injection       | Tampering              | High     | SW integrity via build hash; strict CSP `worker-src`          | ✅ Implemented  |
| F-06 | Clickjacking                             | Tampering              | Medium   | `X-Frame-Options: DENY` in security headers                   | ✅ Implemented  |
| F-07 | PII rendered in browser logs / analytics | Information Disclosure | Medium   | Analytics payloads strip `accountIdentifier`                  | ⚠️ Gap — TM-007 |

### 5.4 Supply Chain / CI

| ID   | Threat                                | STRIDE                 | Severity | Mitigation                                               | Status             |
| ---- | ------------------------------------- | ---------------------- | -------- | -------------------------------------------------------- | ------------------ |
| S-01 | Compromised npm dependency            | Tampering              | High     | `npm ci --frozen-lockfile`; Dependabot; SBOM             | ✅ Implemented     |
| S-02 | Container base image CVE              | Information Disclosure | High     | Trivy/Grype scan on every build + weekly schedule        | ✅ Implemented     |
| S-03 | Leaked CI secret                      | Information Disclosure | High     | Secrets scoped per environment; no `NEXT_PUBLIC_` prefix | ✅ Implemented     |
| S-04 | Malicious GitHub Action               | Tampering              | High     | All Actions pinned to SHA; Dependabot for Actions        | ✅ Implemented     |
| S-05 | Terraform state file exposure         | Information Disclosure | High     | Remote state in encrypted S3 + state locking             | ✅ By infra design |
| S-06 | ENCRYPTION_KEY rotation not automated | Information Disclosure | High     | KMS rotation policy + re-encrypt job needed              | ⚠️ Gap — TM-008    |

### 5.5 Data / KMS Layer

| ID   | Threat                                 | STRIDE                 | Severity | Mitigation                                                          | Status                |
| ---- | -------------------------------------- | ---------------------- | -------- | ------------------------------------------------------------------- | --------------------- |
| D-01 | AES key hardcoded as fallback          | Information Disclosure | Critical | Startup validation rejects missing `ENCRYPTION_KEY` in prod         | ✅ Implemented        |
| D-02 | Cipher text tampering (bit-flip)       | Tampering              | High     | AES-256-GCM AEAD — auth tag invalidates tampered ciphertext         | ✅ By algorithm       |
| D-03 | IV reuse (nonce collision)             | Information Disclosure | High     | IV is `crypto.randomBytes(16)` per encryption call                  | ✅ Implemented        |
| D-04 | Bulk decryption by DB admin            | Information Disclosure | High     | Env-injected key not stored in DB; admin cannot decrypt without key | ✅ By design          |
| D-05 | No KMS envelope encryption             | Information Disclosure | Medium   | Direct AES key used; KMS envelope upgrade needed                    | ⚠️ Gap — TM-009       |
| D-06 | Old ciphertext orphaned after rotation | Tampering / DoS        | High     | Re-encrypt migration job with old-key/new-key support               | ✅ Implemented (#692) |

---

## 6. High/Critical Findings — Pre-Mainnet Gate

> **No deployment to mainnet until all High/Critical findings below are resolved.**

| ID     | Severity | Description                                                                        | Status      | Tracking  |
| ------ | -------- | ---------------------------------------------------------------------------------- | ----------- | --------- |
| TM-001 | Critical | Multi-sig not enforced on escrow `release` — single key controlled all funds       | ✅ Resolved | #629      |
| TM-002 | High     | No SBOM or CVE gate in CI                                                          | ✅ Resolved | #644      |
| TM-003 | High     | E2E tests ran against dev server; must run against production build                | ✅ Resolved | #643      |
| TM-004 | Medium   | `lint --max-warnings` allowed 50 warnings                                          | ✅ Resolved | #643      |
| TM-005 | Medium   | SSRF possible via unvalidated on-ramp provider callback URLs                       | 🔴 Open     | File #693 |
| TM-006 | Medium   | Unvalidated `returnUrl` in on-ramp OAuth-style flows                               | 🔴 Open     | File #694 |
| TM-007 | Medium   | PII (`accountIdentifier`) may appear in browser analytics events                   | 🔴 Open     | File #695 |
| TM-008 | High     | No automated `ENCRYPTION_KEY` rotation policy; manual rotation is error-prone      | 🔴 Open     | File #696 |
| TM-009 | Medium   | Field encryption uses direct AES key — KMS envelope encryption not yet implemented | 🔴 Open     | File #697 |

### Follow-Up Issues to File

| Issue | Title                                                                    | Labels                 |
| ----- | ------------------------------------------------------------------------ | ---------------------- |
| #693  | SSRF guard for on-ramp provider webhook/callback URLs                    | `security`, `backend`  |
| #694  | Validate `returnUrl` against origin allowlist in on-ramp flows           | `security`, `backend`  |
| #695  | Strip PII from browser analytics event payloads                          | `security`, `frontend` |
| #696  | Automate `ENCRYPTION_KEY` rotation with zero-downtime re-encrypt job     | `security`, `infra`    |
| #697  | Upgrade field encryption to KMS envelope encryption (AWS KMS / GCP CKMS) | `security`, `infra`    |

---

## 7. Ongoing Review Cadence

| Activity                           | Frequency                            | Owner                    | Tooling                                        |
| ---------------------------------- | ------------------------------------ | ------------------------ | ---------------------------------------------- |
| Automated CVE scan (Trivy + Grype) | Every PR + weekly                    | CI                       | `.github/workflows/vulnerability-scanning.yml` |
| `npm audit`                        | Every PR                             | CI                       | `.github/workflows/ci.yml`                     |
| SAST scan (CodeQL / Semgrep)       | Every PR                             | CI                       | `.github/workflows/security-scanning.yml`      |
| Secret scanning                    | Every commit                         | GitHub Advanced Security | Automated                                      |
| Threat model review                | Before each mainnet upgrade          | Security lead            | This document                                  |
| PII encryption key rotation drill  | Quarterly                            | Ops team                 | `scripts/rotate-secret.sh`                     |
| External audit                     | Before mainnet launch, then annually | External firm            | `docs/audit/`                                  |
| Dependency updates                 | Weekly                               | Automated                | Renovate / Dependabot                          |
| Incident response drill            | Quarterly                            | Ops team                 | `docs/runbooks/`                               |
| Disaster recovery drill            | Bi-annually                          | Ops team                 | `.github/workflows/dr-drill.yml`               |

---

## 8. Out-of-Scope Risks (Accepted)

| Risk                                | Rationale                                                                |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Stellar or Base consensus failure   | Protocol-level; beyond our control; mitigated by timeouts + refund paths |
| Paycrest API outages                | Non-custodial; handled via retry + user notification                     |
| User's own wallet compromise        | By design — non-custodial, we never hold keys                            |
| Allbridge bridge protocol bugs      | Mitigated by bridge status polling + manual resolution runbook           |
| Force majeure (data centre failure) | Mitigated by multi-region failover in Terraform + DR plan                |

---

## 9. Contributor Summary

This threat model is a **shared responsibility**. Contributors working on security-relevant
areas should:

1. **Open a PR updating this document** when adding a new API route, data store, external
   integration, or credential.
2. **Reference the relevant threat IDs** (e.g. `TM-008`) in commit messages and PR descriptions.
3. **Do not merge** a PR that introduces new High/Critical threats without filing a tracking
   issue and adding a row to §6.
4. **Run the smoke suite** (`npm run test:e2e -- e2e/smoke.spec.ts`) against your branch
   before raising a PR.
5. **Check `SECURITY.md`** for the security audit checklist before every deploy.

Security questions? Contact the maintainer via Telegram: [t.me/Xoulomon](https://t.me/Xoulomon).
Do **not** open public GitHub issues for undisclosed vulnerabilities.

---

## 10. Revision History

| Version | Date       | Author        | Changes                                                                                                                                                                                                        |
| ------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-06-27 | Security lead | Initial threat model                                                                                                                                                                                           |
| 2.0     | 2026-06-28 | Security lead | Added on-ramp threats, field-level encryption (A-07–A-09, D-01–D-06), KMS gap (TM-009), analytics PII gap (TM-007), SSRF gap (TM-005), full trust-boundary diagram, actor table expansion, contributor summary |
