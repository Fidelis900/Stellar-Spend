# Compliance & Regulatory Notice Framework

> Documents KYC/AML posture, per-corridor regulatory notices, data handling policy, and the user-facing compliance FAQ for Stellar-Spend.

---

## Table of Contents

- [Overview](#overview)
- [KYC Tiers and Limits](#kyc-tiers-and-limits)
- [AML Screening](#aml-screening)
- [Per-Corridor Regulatory Notices](#per-corridor-regulatory-notices)
- [Data Handling and Retention](#data-handling-and-retention)
- [User-Facing Compliance FAQ](#user-facing-compliance-faq)
- [Localization Notes](#localization-notes)
- [Legal Placeholders](#legal-placeholders)

---

## Overview

Stellar-Spend operates as a non-custodial stablecoin off-ramp. The platform never holds user funds; it bridges user-signed Stellar transactions to fiat settlement via licensed payment partners (Paycrest). Regulatory obligations are distributed across the platform and its licensed partners.

```
User  →  Stellar-Spend (non-custodial bridge)  →  Paycrest (licensed PSP)  →  Bank
```

Stellar-Spend's compliance obligations focus on:

- Transaction monitoring and AML screening (`src/lib/compliance-screening.ts`)
- KYC tier enforcement and limit management (`src/lib/kyc-limits.ts`)
- Data handling under GDPR and applicable local laws
- Per-corridor regulatory disclosures to users

---

## KYC Tiers and Limits

KYC tiers are defined in `src/lib/kyc-limits.ts`. Default global limits:

| Tier       | Daily Limit (USD) | Monthly Limit (USD) | Per-Transaction Limit (USD) | Requirements                                   |
| ---------- | ----------------- | ------------------- | --------------------------- | ---------------------------------------------- |
| **Tier 1** | 1,000             | 10,000              | 500                         | Email verification only                        |
| **Tier 2** | 5,000             | 50,000              | 2,500                       | Government-issued ID                           |
| **Tier 3** | 50,000            | 500,000             | 25,000                      | ID + proof of address + enhanced due diligence |

### Corridor overrides

Some corridors have higher regulatory requirements, reflected in KYC limit overrides. Example (Nigeria):

```ts
// NGN corridor raises Tier 2 limits
NGN: {
  tier2: { dailyLimit: 10_000, monthlyLimit: 100_000, transactionLimit: 5_000 },
}
```

Overrides are loaded from `corridor-config` at server startup via `setCorridorOverrides()` and stored in `localStorage` for offline use.

### KYC lifecycle states

| State        | Description                                          |
| ------------ | ---------------------------------------------------- |
| `unverified` | User has not submitted documents; limited to Tier 1  |
| `pending`    | Documents submitted; under review (typically < 24 h) |
| `verified`   | Identity confirmed; tier unlocked                    |
| `rejected`   | Submission failed review; user notified with reason  |

### Limit enforcement

Before each transaction, the server checks `UserLimits` to verify remaining daily and monthly allowances. Transactions that exceed the limit return HTTP 422 with error code `LIMIT_EXCEEDED`. Users can request a tier upgrade via the `LimitIncreaseRequest` flow.

### Audit trail

All KYC events — submission, verification, rejection, tier changes — are recorded in `audit_logs` (via `src/lib/audit-logging.ts`) and in the in-memory / localStorage `stellar_spend_kyc_audit` array for client-side audit trails.

---

## AML Screening

AML screening (`src/lib/compliance-screening.ts`) is applied to each transaction before submission.

### Risk levels

| Level     | Action                                     |
| --------- | ------------------------------------------ |
| `low`     | Transaction proceeds                       |
| `medium`  | Transaction proceeds with enhanced logging |
| `high`    | Transaction held for manual review         |
| `blocked` | Transaction rejected; user notified        |

### Screening data points

- Wallet address sanctions check (OFAC SDN-equivalent list)
- Transaction amount pattern analysis
- Frequency and velocity checks
- Beneficiary account screening
- Corridor-specific watchlists

### Records

Screening results are stored in `audit_logs` with `action_type = 'aml_screening'`. High and blocked results also trigger alerts to the operations team (see [runbooks](./runbooks/index.md)).

---

## Per-Corridor Regulatory Notices

Each supported corridor displays a regulatory notice to the user before they confirm a transaction. Notices cover: applicable law, licensed partner, data sharing consent, and right to refuse service.

### Nigeria (NGN)

**Regulatory authority:** Central Bank of Nigeria (CBN)  
**Licensed partner:** Paycrest (operating under applicable Nigerian fintech regulations)  
**Notice to users:**

> By proceeding, you confirm that the source of funds is legitimate and that this transfer does not violate the CBN's regulations on foreign exchange transactions. Transfers above ₦5,000,000 per transaction require additional documentation. Your transaction data may be reported to the Nigerian Financial Intelligence Unit (NFIU) as required by the Money Laundering (Prevention and Prohibition) Act 2022.

### Kenya (KES)

**Regulatory authority:** Central Bank of Kenya (CBK)  
**Licensed partner:** Paycrest  
**Notice to users:**

> This service complies with the Kenya National Payment System Act (2011) and CBK guidelines on digital financial services. Transfers are subject to Kenya Revenue Authority (KRA) reporting requirements for transactions above KES 1,000,000. Your data may be shared with the Financial Reporting Centre (FRC) as required by the Proceeds of Crime and Anti-Money Laundering Act (POCAMLA).

### Ghana (GHS)

**Regulatory authority:** Bank of Ghana (BoG)  
**Licensed partner:** Paycrest  
**Notice to users:**

> Transactions are processed in compliance with the Bank of Ghana's Payment Systems and Services Act, 2019 (Act 987) and guidelines on electronic money issuance. Data may be reported to the Financial Intelligence Centre (FIC) for transactions meeting reporting thresholds under the Anti-Money Laundering Act, 2020 (Act 1044).

### Adding a new corridor

When onboarding a new corridor, add a regulatory notice object to the corridor configuration (`src/lib/corridor-config.ts`). Each notice must include:

```ts
{
  jurisdiction: string;          // e.g. "Nigeria"
  authority: string;             // Regulatory body name
  partnerName: string;           // Licensed PSP name
  noticeText: string;            // Plain-language user notice
  reportingThreshold?: number;   // Amount (in local currency) above which reporting is mandatory
  legalBasis: string;            // Primary law reference
  lastReviewedAt: string;        // ISO 8601 date; must be < 12 months old
}
```

See `docs/add-a-corridor.md` for the full onboarding checklist.

---

## Data Handling and Retention

### Data collected

| Data Type                           | Purpose                                   | Storage                                               |
| ----------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Stellar public key                  | Transaction identification, rate limiting | DB `transactions.user_address`                        |
| Beneficiary bank account & name     | Fiat settlement                           | DB `transactions.*`, encrypted at rest                |
| IP address                          | Fraud detection, rate limiting            | DB `audit_logs.ip_address`, `sessions.ip_address`     |
| KYC documents (type + reference ID) | Identity verification                     | DB `kyc_limits` store; documents held by KYC provider |
| Transaction history                 | User-facing history, dispute handling     | DB `transactions`; also `localStorage` in browser     |
| Session tokens                      | Authentication                            | DB `sessions`                                         |

### Retention periods

| Data                  | Retention                      | Basis                                                  |
| --------------------- | ------------------------------ | ------------------------------------------------------ |
| Transaction records   | 7 years                        | AML/CTF statutory requirement (varies by jurisdiction) |
| KYC records           | 5 years after last transaction | FATF Recommendation 11; local law                      |
| Audit logs            | 2 years                        | Internal policy; security investigation                |
| Session tokens        | Until expiry + 30 days         | Session management                                     |
| IP / access logs      | 12 months                      | Security and fraud analysis                            |
| Webhook delivery logs | 90 days                        | Debugging                                              |

Retention cleanup is handled by scheduled cron jobs. The `audit_log_retention` table records the active retention policy and last cleanup time.

### GDPR and data subject rights

For users in the European Economic Area (EEA) or UK, the following rights apply:

| Right                  | How to exercise                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Access                 | Email `privacy@stellar-spend.com` — 30-day response                                                   |
| Rectification          | Contact support; incorrect beneficiary data can be corrected before settlement                        |
| Erasure                | Available for non-AML data; transaction records that must be retained for legal purposes are excluded |
| Portability            | Transaction export available via **Settings → Export History** (CSV / PDF)                            |
| Objection to profiling | AML screening cannot be turned off; all other analytics profiling is opt-out                          |

**Legal basis for processing:** Contract performance (transaction execution); Legitimate interests (fraud prevention, AML); Legal obligation (regulatory reporting).

**Data transfers:** Transaction data is processed in the EU and may be transferred to Nigeria, Kenya, and Ghana for settlement purposes. Transfers rely on standard contractual clauses (SCCs) and adequacy decisions where applicable.

### Local law considerations

| Jurisdiction | Key law                            | Notes                                             |
| ------------ | ---------------------------------- | ------------------------------------------------- |
| Nigeria      | NDPR 2019, NITDA guidelines        | 30-day breach notification                        |
| Kenya        | Data Protection Act 2019           | Mandatory DPA registration for data controllers   |
| Ghana        | Data Protection Act 2012 (Act 843) | Mandatory Data Protection Commission registration |

---

## User-Facing Compliance FAQ

**Q: Why do I need to verify my identity?**  
A: We are required by the financial regulations of our partner payment service providers and the jurisdictions we operate in to verify the identity of users conducting transactions above certain thresholds. This protects you and helps us prevent fraud and money laundering.

**Q: What documents are accepted for Tier 2 verification?**  
A: Government-issued photo ID: national ID card, passport, or driver's licence. Documents must be valid and show your full legal name and date of birth.

**Q: How long does verification take?**  
A: Most verifications complete within a few minutes. In rare cases, manual review can take up to 24 hours. You will receive an email notification when your status changes.

**Q: Why was my transaction blocked?**  
A: Transactions may be blocked if they trigger our AML risk controls, if you have exceeded your daily or monthly transaction limit, or if your KYC status is pending or rejected. Contact support with your transaction reference for details.

**Q: Can I request a higher limit?**  
A: Yes. Navigate to **Settings → Verification** and select "Request Limit Increase". You will be asked to complete the next KYC tier.

**Q: Who sees my personal data?**  
A: Your identity data is shared with our licensed KYC provider for verification, and transaction data is shared with Paycrest (our licensed payment partner) for settlement. We do not sell your data to third parties.

**Q: How do I request deletion of my data?**  
A: Email `privacy@stellar-spend.com` with the subject "Data Deletion Request". Note that transaction records required for AML compliance cannot be deleted before their statutory retention period expires.

**Q: Is my bank account safe?**  
A: We never store your full bank account credentials. Beneficiary account numbers are stored in encrypted form and used solely to route your settlement payment.

---

## Localization Notes

All user-facing compliance text should be translated via the i18n system (`src/lib/i18n/`). Regulatory notice text is stored in locale files under `src/lib/i18n/locales/` and keyed by corridor code.

When updating notice text following a legal or regulatory change:

1. Update the source string in `en.json`.
2. File translation requests for all supported locales before the change goes live.
3. Update `lastReviewedAt` in the corridor config.
4. Record the change in the compliance changelog below.

---

## Legal Placeholders

The following items require sign-off from legal counsel before production deployment:

- [ ] Formal privacy policy (link in footer): `[LEGAL: draft privacy-policy.md]`
- [ ] Terms of service for each jurisdiction: `[LEGAL: draft tos-{region}.md]`
- [ ] Data processing agreements with Paycrest and KYC providers: `[LEGAL: DPA-paycrest.pdf]`
- [ ] GDPR Article 30 records of processing: `[LEGAL: RoPA document]`
- [ ] Regulatory notices reviewed by in-country counsel: `[LEGAL: per-corridor sign-off]`

---

## Compliance Changelog

| Date       | Change                                | Author    |
| ---------- | ------------------------------------- | --------- |
| 2026-06-27 | Initial compliance framework document | Docs team |
