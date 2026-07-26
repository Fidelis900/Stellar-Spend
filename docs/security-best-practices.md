# Security Best Practices

This document covers security guidelines for contributors and operators of Stellar-Spend. It addresses secret management, private key handling, API key rotation, rate limiting, CORS, webhook signature verification, SQL injection prevention, XSS mitigation, and session management.

---

## Table of Contents

- [Secret Management](#secret-management)
- [Private Key Handling](#private-key-handling)
- [API Key Rotation](#api-key-rotation)
- [Rate Limiting Configuration](#rate-limiting-configuration)
- [CORS Configuration](#cors-configuration)
- [Webhook Signature Verification](#webhook-signature-verification)
- [SQL Injection Prevention](#sql-injection-prevention)
- [XSS Prevention](#xss-prevention)
- [Session Management Best Practices](#session-management-best-practices)
- [Two-Factor Authentication](#two-factor-authentication)
- [IP Whitelisting](#ip-whitelisting)
- [Audit Logging](#audit-logging)

---

## Secret Management

### Secret Inventory

All application secrets are documented in [`docs/secrets-management.md`](./secrets-management.md). The following secrets are server-only and must **never** be exposed to the client:

| Secret | Purpose |
|---|---|
| `PAYCREST_API_KEY` | Authenticates requests to the Paycrest API |
| `PAYCREST_WEBHOOK_SECRET` | Verifies HMAC signatures on Paycrest webhook events |
| `BASE_PRIVATE_KEY` | Signs on-chain payout transactions on the Base network |
| `BASE_RETURN_ADDRESS` | Treasury address for refunds |
| `BASE_RPC_URL` | Base mainnet RPC provider URL |
| `STELLAR_SOROBAN_RPC_URL` | Soroban RPC for server-side transaction building |
| `STELLAR_HORIZON_URL` | Horizon endpoint for account and trustline lookups |
| `DATABASE_URL` | PostgreSQL connection string |
| `API_KEY_ADMIN_TOKEN` | Bearer token for admin API key management |
| `SENTRY_AUTH_TOKEN` | Sentry token for source map uploads (CI only) |

### Rules

1. **Never prefix server secrets with `NEXT_PUBLIC_`.** The application validates this at startup and throws an error if `NEXT_PUBLIC_PAYCREST_API_KEY`, `NEXT_PUBLIC_BASE_PRIVATE_KEY`, or `NEXT_PUBLIC_PAYCREST_WEBHOOK_SECRET` are detected.
2. **Never commit secrets to version control.** `.env.local` is in `.gitignore` — keep it there.
3. **Use environment-specific secrets.** Development, staging, and production environments must each have separate credentials.
4. **Rotate secrets immediately** if there is any suspicion of exposure. See [API Key Rotation](#api-key-rotation) below.

### Local Development

```bash
cp .env.example .env.local
# Fill in real values in .env.local — this file is gitignored
```

### Production (Vercel)

Set all secrets in **Vercel → Project → Settings → Environment Variables** scoped to the `Production` environment. Vercel injects them at runtime without writing to disk.

### CI/CD

Expose only `SENTRY_AUTH_TOKEN` in CI (for source map uploads). Never expose `BASE_PRIVATE_KEY` or `PAYCREST_API_KEY` in CI pipelines unless strictly required, and always scope them to specific workflow steps.

---

## Private Key Handling

The `BASE_PRIVATE_KEY` is used to sign on-chain payout transactions. Mishandling this key can result in total loss of funds.

### Guidelines

1. **Store in a secrets manager in production.** Use AWS Secrets Manager, HashiCorp Vault, or equivalent — not plain environment variables on shared infrastructure.
2. **Never log the private key.** The logger is configured to redact sensitive fields, but defensive code should never pass a private key to any logging call.
3. **Never return the private key in an API response.** The error sanitiser in `src/lib/error-handler.ts` redacts fields matching `key`, `secret`, `token`, etc., but code must not expose keys in the response body.
4. **Use a hardware security module (HSM) or KMS** for production key signing where possible.
5. **Limit blast radius.** The key should only have the permissions necessary to sign payout transactions — use a dedicated wallet, not a general-purpose treasury wallet.
6. **Stellar keys:** Never pass `STELLAR_SOROBAN_RPC_URL` or private Stellar keys to client-side code. Transaction signing occurs server-side only.

### Key Compromise Response

If the `BASE_PRIVATE_KEY` is compromised:

1. Immediately revoke and rotate the key in your secrets manager
2. Update the environment variable in Vercel and redeploy
3. Transfer funds from the compromised wallet to a new wallet
4. File an incident report in your issue tracker
5. Review audit logs for any unauthorised transactions

---

## API Key Rotation

Stellar-Spend supports programmatic API key rotation. Keys follow a lifecycle: `active → rotated → revoked`.

### Rotation Procedure

1. **Create a replacement key** via the admin API:
   ```http
   POST /api/admin/api-keys
   Authorization: Bearer <API_KEY_ADMIN_TOKEN>
   Content-Type: application/json

   {
     "name": "my-key-v2",
     "rateLimitMaxRequests": 60,
     "rateLimitWindowMs": 60000
   }
   ```
   Save the returned key value securely — it is shown only once.

2. **Update your application** to use the new key.

3. **Verify the new key works** in a non-production environment first.

4. **Rotate the old key** (marks it `rotated`, stops accepting requests):
   ```http
   POST /api/admin/api-keys/:id/rotate
   Authorization: Bearer <API_KEY_ADMIN_TOKEN>
   ```

5. **Revoke the old key** after confirming the new key is in use:
   ```http
   DELETE /api/admin/api-keys/:id
   Authorization: Bearer <API_KEY_ADMIN_TOKEN>

   { "reason": "Scheduled rotation" }
   ```

### Rotation Schedule

- **Routine rotation:** Every 90 days for all active API keys
- **On suspected compromise:** Immediately
- **On personnel change:** Rotate any keys that departed team members had access to

### Key Storage

- Store API keys in a password manager or secrets manager — never in source code or configuration files committed to version control
- Keys are stored as SHA-256 hashes in the database (`key_hash` column); the plaintext is never persisted

---

## Rate Limiting Configuration

Rate limiting is enforced per API key using a sliding window algorithm.

### Default Limits

| Setting | Default Value |
|---|---|
| `rate_limit_max_requests` | 60 requests |
| `rate_limit_window_ms` | 60,000 ms (1 minute) |

These defaults are configurable per key at creation time.

### Configuring Limits

```http
POST /api/admin/api-keys
Authorization: Bearer <API_KEY_ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "high-volume-integration",
  "rateLimitMaxRequests": 300,
  "rateLimitWindowMs": 60000
}
```

### Handling Rate Limit Responses

When a rate limit is exceeded, the API returns **429 Too Many Requests**. Clients should:

1. Respect the `Retry-After` header if present
2. Implement exponential backoff with jitter:
   ```
   delay = min(base_delay * 2^attempt + random(0, 1000ms), max_delay)
   ```
3. Reduce request volume by batching where possible

### Global Thresholds (Monitoring)

Monitoring alert thresholds are defined in `src/lib/monitoring.ts`:

| Alert | Threshold |
|---|---|
| Queue depth warning | 50 items |
| Queue depth critical | 200 items |
| Error rate P2 | 3 errors/minute |
| Error rate P1 | 10 errors/minute |

---

## CORS Configuration

Cross-Origin Resource Sharing (CORS) is configured in [`src/lib/cors.ts`](../src/lib/cors.ts).

### Production Configuration

In production, set the `ALLOWED_ORIGINS` environment variable to a comma-separated list of permitted origins:

```env
ALLOWED_ORIGINS=https://stellar-spend.app,https://app.stellar-spend.app
```

The application rejects requests from any origin not in this list by returning no `Access-Control-Allow-Origin` header.

### Development Defaults

In development (when `ALLOWED_ORIGINS` is not set), the following localhost origins are permitted:

- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:3002`

### Allowed Methods and Headers

```
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id
Access-Control-Max-Age: 86400
```

### Guidelines

1. **Never set `ALLOWED_ORIGINS=*` in production.** Wildcard origins bypass CORS protection.
2. **Review allowed origins after infrastructure changes** — remove any origins that are no longer in use.
3. **Test CORS configuration** by sending requests from an unlisted origin and confirming they are rejected with a CORS error.

---

## Webhook Signature Verification

Paycrest sends webhook events signed with an HMAC-SHA512 signature. Every incoming webhook must be verified before processing.

### Verification Process

1. Read the raw request body (do not parse JSON first — the signature is over the raw bytes)
2. Compute `HMAC-SHA512(PAYCREST_WEBHOOK_SECRET, rawBody)`
3. Compare the computed signature with the value in the `X-Paycrest-Signature` header (or equivalent) using a **constant-time comparison** to prevent timing attacks:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  rawBody: Buffer,
  receivedSignature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(receivedSignature, 'hex');

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
```

4. If verification fails, return `400 Bad Request` and log the event for monitoring.
5. If verification passes, process the event and return `200 OK`.

### Security Rules

- **Always use `crypto.timingSafeEqual`** — regular string comparison (`===`) is vulnerable to timing attacks
- **Process each webhook event only once** — use the idempotency key system to deduplicate retries
- **Validate the event timestamp** — reject events older than 5 minutes to prevent replay attacks
- **Rotate `PAYCREST_WEBHOOK_SECRET`** in the Paycrest dashboard and update the environment variable whenever the secret is rotated

---

## SQL Injection Prevention

All database queries in Stellar-Spend use **parameterised queries** via the `pg` library. Raw string interpolation in SQL is never used.

### Correct Pattern

```typescript
// ✅ Correct — parameterised query
const result = await pool.query(
  'SELECT * FROM transactions WHERE user_address = $1 AND status = $2',
  [userAddress, status]
);
```

### Incorrect Pattern

```typescript
// ❌ Never do this — vulnerable to SQL injection
const result = await pool.query(
  `SELECT * FROM transactions WHERE user_address = '${userAddress}'`
);
```

### Guidelines for Contributors

1. **Always use query parameters** (`$1`, `$2`, …) for user-supplied values
2. **Never concatenate user input** into SQL strings
3. **Use the repository pattern** in `src/lib/repositories/` — these abstractions enforce parameterised queries and prevent direct SQL construction in route handlers
4. **Validate input before querying** — the `ErrorHandler.validation()` helper should be called on all user inputs before they reach database code

---

## XSS Prevention

### Output Encoding

Stellar-Spend is a Next.js application. React's JSX automatically HTML-encodes values rendered in JSX expressions, preventing most reflected XSS:

```tsx
// ✅ Safe — React encodes this automatically
<p>{userInput}</p>

// ❌ Dangerous — bypasses React's encoding
<p dangerouslySetInnerHTML={{ __html: userInput }} />
```

### Guidelines

1. **Never use `dangerouslySetInnerHTML`** with untrusted data. If rich HTML is required, use a library like `DOMPurify` to sanitise the input first.
2. **Validate and sanitise user-supplied URLs** before using them in `href` or `src` attributes — reject `javascript:` URIs.
3. **Set a Content Security Policy (CSP)** header in `next.config.ts` to restrict which resources can be loaded:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';
   ```
4. **Use `HttpOnly` and `Secure` flags** on all session cookies.
5. **Sanitise error messages** before rendering them to users — the `ErrorHandler` class already strips sensitive paths and tokens from server-side messages, but client-side code should not render raw API error responses without review.

### Sentry Precautions

The Sentry client config (`sentry.client.config.ts`) enables:
- `maskAllText: true` — prevents sensitive text from being captured in session replays
- `blockAllMedia: true` — prevents media from being captured

Never disable these settings in production.

---

## Session Management Best Practices

Session management is implemented in [`src/lib/session-management.ts`](../src/lib/session-management.ts).

### Session Lifecycle

| Property | Value |
|---|---|
| Session timeout | 30 minutes of inactivity |
| Refresh token expiry | 7 days |
| Token format | 32-byte cryptographically random hex string |
| Session ID format | `session_<timestamp>_<8 random bytes hex>` |

### Security Properties

1. **Tokens are generated with `crypto.randomBytes(32)`** — they are not predictable or guessable.
2. **Sessions are tied to the user's Stellar wallet address** — a session token cannot be used for a different account.
3. **IP address and user agent are stored** for anomaly detection. Flag sessions where the IP changes mid-session.
4. **Session tokens are never logged.** The logger is configured to redact sensitive fields.

### Session Revocation

Sessions should be revoked immediately in the following scenarios:

- User logs out explicitly
- Suspicious activity is detected (IP change, unusual access pattern)
- User's API key is revoked
- Password or key rotation event

```typescript
await sessionService.revokeSession(sessionId, 'User requested logout');
```

### Guidelines for Operators

1. **Monitor `session_revocations`** table for patterns indicating brute-force or account takeover attempts
2. **Set database-level TTL cleanup** to purge expired sessions regularly (see data retention in [Database Schema](./database-schema.md))
3. **Alert on sudden spike in session revocations** — may indicate a compromised token being used at scale

---

## Two-Factor Authentication

2FA is implemented in [`src/lib/two-fa.ts`](../src/lib/two-fa.ts) and supports TOTP and backup codes.

### TOTP Configuration

| Property | Value |
|---|---|
| Algorithm | HMAC-SHA1 |
| Time window | 30 seconds |
| Digits | 6 |
| Clock skew tolerance | ±1 window (±30 seconds) |

### Guidelines

1. **Generate TOTP secrets with `crypto.randomBytes(32)`** — never use user-supplied seeds.
2. **Store backup codes as hashes**, not plaintext — hash with bcrypt or argon2 before storing.
3. **Invalidate backup codes after use** — each backup code is single-use.
4. **Enforce 2FA on all admin and operator accounts.**
5. **Rate-limit 2FA verification attempts** — lock the account after 5 failed attempts within 10 minutes.

---

## IP Whitelisting

IP whitelisting is managed via the `ip_whitelist` and `ip_violations` tables (migration `012_add_ip_whitelisting.sql`).

### Configuration

Allowlist individual IPs or CIDR ranges for API access:

```typescript
await ipWhitelistService.addEntry({
  userAddress: 'G...',
  ipAddress: '203.0.113.42',
  label: 'Office static IP',
});
```

### Violation Logging

All requests from non-allowlisted IPs are logged to `ip_violations` with:
- The requesting IP address
- Violation type (e.g., `not_whitelisted`, `range_exceeded`)
- Severity level

### Guidelines

1. **Review `ip_violations` regularly** for suspicious patterns
2. **Do not allowlist `0.0.0.0/0`** — this defeats the purpose of whitelisting
3. **Audit the whitelist on personnel change** — remove any IPs associated with departed employees or contractors
4. **Prefer static IPs for integrations** — dynamic IPs make allowlist management difficult

---

## Audit Logging

All significant actions are logged to the `audit_logs` table (migration `015_add_audit_logging.sql`) via `src/lib/audit-logging.ts`.

### What is Audited

- Transaction creation, updates, and failures
- Session creation and revocation
- API key creation, rotation, and revocation
- IP whitelist changes
- Admin actions (`admin_actions` table)

### Retention

Default retention is **90 days**. This is configurable via the `audit_log_retention` table. Adjust based on your compliance requirements (e.g., PCI DSS requires 1 year of audit log retention).

### Guidelines

1. **Never delete audit logs manually** — use the retention policy mechanism
2. **Restrict write access to `audit_logs`** — only the application service account should be able to insert rows
3. **Export audit logs to long-term storage** (e.g., S3 with Glacier lifecycle rules) before the retention window expires
4. **Alert on failed admin actions** — a spike in `status = 'failure'` in `admin_actions` may indicate an attempted breach

---

## Related Documentation

- [Secrets Management](./secrets-management.md)
- [Error Codes & Troubleshooting](./error-codes.md)
- [Database Schema](./database-schema.md)
- [Monitoring & Observability](./monitoring.md)
- [API Reference](./api.md)
