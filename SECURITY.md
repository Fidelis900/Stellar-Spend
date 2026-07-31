# Security Best Practices

This document outlines security considerations and best practices for deploying and maintaining Stellar-Spend.

---

## 1. Private Key Handling

Stellar-Spend uses a server-side Base wallet (`BASE_PRIVATE_KEY`) to execute payout transactions. This key must be treated as a critical secret.

**Rules:**

- Never prefix it with `NEXT_PUBLIC_` — doing so exposes it to the browser bundle.
- Store it in `.env.local` (never commit this file).
- In production, inject it via your hosting provider's secret/environment management (e.g., Vercel Environment Variables, AWS Secrets Manager).
- Rotate the key immediately if you suspect exposure.
- Grant the wallet only the minimum on-chain balance needed for operations; do not use it as a treasury wallet.

**What the app does:**

- The app validates at startup that `BASE_PRIVATE_KEY` is present and not accidentally exposed as a public variable, throwing a clear error if misconfigured.

---

## 2. Webhook Signature Verification

Paycrest sends signed webhook events to `/api/webhooks/paycrest`. Every incoming request must be verified before processing.

**How it works:**

- Paycrest signs each request using `PAYCREST_WEBHOOK_SECRET` (HMAC-SHA512).
- The handler computes the expected signature from the raw request body and compares it to the `X-Paycrest-Signature` header using a constant-time comparison to prevent timing attacks.

**Best practices:**

- Always verify the signature before acting on any webhook payload.
- Reject requests with missing or invalid signatures with `401 Unauthorized`.
- Use the raw (unparsed) request body for signature computation — parsing first can alter the byte sequence.
- Keep `PAYCREST_WEBHOOK_SECRET` server-only; never expose it publicly.
- Log rejected webhook attempts for audit purposes.

---

## 3. Rate Limiting

API routes that trigger external calls or financial operations should be rate-limited to prevent abuse.

**Recommended limits:**

| Route                              | Suggested Limit                  |
| ---------------------------------- | -------------------------------- |
| `POST /api/offramp/quote`          | 30 req / min per IP              |
| `POST /api/offramp/execute-payout` | 10 req / min per IP              |
| `POST /api/offramp/verify-account` | 20 req / min per IP              |
| `POST /api/webhooks/paycrest`      | 60 req / min (Paycrest IPs only) |

**Implementation options:**

- Use [Vercel's built-in rate limiting](https://vercel.com/docs/security/rate-limiting) for edge-level protection.
- Use an `upstash/ratelimit` + Redis middleware for fine-grained per-route control.
- For the webhook endpoint, additionally allowlist Paycrest's published IP ranges.

---

## 4. CORS Configuration

Stellar-Spend is a Next.js app — API routes are same-origin by default. If you ever expose routes to external consumers, configure CORS explicitly.

**Defaults (no action needed for standard deployment):**

- Next.js API routes do not set CORS headers by default, meaning only same-origin requests are accepted by browsers.

**If cross-origin access is required:**

- Allowlist only trusted origins — never use `Access-Control-Allow-Origin: *` for authenticated or financial endpoints.
- Set `Access-Control-Allow-Methods` to only the HTTP methods each route needs.
- Set `Access-Control-Allow-Headers` to only the headers your client sends.

Example middleware snippet:

```ts
// middleware.ts
const ALLOWED_ORIGINS = ['https://your-production-domain.com'];

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '';
  const res = NextResponse.next();
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return res;
}
```

---

## 5. Secret Scanning

Gitleaks is used to detect secrets before they are committed or pushed.

**Run gitleaks locally before pushing:**

```bash
# Install gitleaks (macOS)
brew install gitleaks

# Scan the current directory for secrets
gitleaks detect --source .

# Scan a specific file or directory
gitleaks detect --source src/test/fixtures/secret-scan/ --no-git

# Run the secret scanning verification test
npm test -- --testPathPattern="gitleaks"
```

The fixture-based verification test in `src/test/gitleaks-verification.test.ts` confirms that gitleaks detects Stellar secret keys (`S` + 55 base58 chars). The `.gitleaks.toml` config contains the `stellar-secret-key` rule and allowlists known false positives and test fixtures.

---

## 6. Security Audit Checklist

Use this checklist before every production deployment.

### Secrets & Environment

- [ ] `.env.local` is in `.gitignore` and has never been committed
- [ ] No `NEXT_PUBLIC_` prefix on `PAYCREST_API_KEY`, `PAYCREST_WEBHOOK_SECRET`, or `BASE_PRIVATE_KEY`
- [ ] Production secrets are injected via the hosting provider's secret store, not hardcoded
- [ ] `BASE_PRIVATE_KEY` wallet holds only the minimum required balance

### API & Webhooks

- [ ] Paycrest webhook signature verification is active and tested
- [ ] All financial API routes return `401` for unauthenticated/invalid requests
- [ ] Rate limiting is configured on quote, execute-payout, and verify-account routes
- [ ] Webhook endpoint rejects requests from unexpected IPs

### CORS & Headers

- [ ] CORS is not set to wildcard (`*`) on any API route
- [ ] Security headers are set (CSP, X-Frame-Options, X-Content-Type-Options) — consider [next-secure-headers](https://github.com/jagaapple/next-secure-headers)

### Dependencies

- [ ] `npm audit` returns no high/critical vulnerabilities
- [ ] Dependencies are pinned or regularly updated via Dependabot/Renovate

### Operational

- [ ] Error responses never leak stack traces or internal details to the client
- [ ] Transaction history in `localStorage` does not store raw private keys or full account credentials
- [ ] Monitoring/alerting is in place for failed payout attempts and webhook rejections

---

## 7. Threat Model & Audit

A comprehensive threat model (assets, actors, attack surfaces, STRIDE analysis) lives in [`docs/threat-model.md`](./docs/threat-model.md).

**Pre-mainnet gate:** No deployment to mainnet is permitted until all High/Critical findings in the threat model are resolved and an external audit summary is published.

### Automated Static Analysis

Smart contracts are analysed on every PR via `.github/workflows/contract-audit.yml`:

- `cargo clippy -D warnings` — Rust lints treated as errors
- `cargo audit` — checks `Cargo.lock` against the RustSec advisory database
- `cargo fmt --check` — enforces consistent formatting

### External Audit

Before mainnet deployment, engage an external auditor. After triage:

1. Fix all High/Critical findings.
2. Publish the audit report in `docs/audit/` (redacted if needed).
3. Re-run all tests and static analysis.
4. Update the threat model status table.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public GitHub issue. Contact the maintainer directly via Telegram: [t.me/Xoulomon](https://t.me/Xoulomon).

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

You can expect an acknowledgment within 48 hours.
