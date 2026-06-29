# Integrator / Third-Party SDK Guide

This guide explains how to embed Stellar-Spend's off-ramp and on-ramp service into your own product. By the end you will have a working sandbox integration that can get a quote, create a payout order, and verify webhook signatures.

---

## Table of Contents

1. [Overview](#overview)
2. [API Key Issuance and Scopes](#api-key-issuance-and-scopes)
3. [Sandbox vs Production Setup](#sandbox-vs-production-setup)
4. [Quickstart](#quickstart)
5. [TypeScript Client Example](#typescript-client-example)
6. [Core Flows](#core-flows)
   - [Quote Flow](#quote-flow)
   - [Bridge Transaction Flow](#bridge-transaction-flow)
   - [Payout Order Flow](#payout-order-flow)
   - [Webhook Handling](#webhook-handling)
7. [Auth, Rate Limits, and Idempotency](#auth-rate-limits-and-idempotency)
8. [Error Handling](#error-handling)
9. [Production Onboarding Checklist](#production-onboarding-checklist)
10. [Full API Reference](#full-api-reference)

---

## Overview

Stellar-Spend exposes a versioned REST API (`/api/v1/`) that lets third-party integrators:

- Fetch live USDC → fiat quotes
- Build and submit Stellar Soroban bridge transactions
- Create Paycrest fiat payout orders
- Receive real-time settlement events via webhooks

The API is designed to be non-custodial: **your users keep custody of their keys** and only sign transactions locally. The server never holds private keys belonging to end-users.

---

## API Key Issuance and Scopes

### Getting an API key

API keys are provisioned by an admin using the key management endpoint. In sandbox mode, contact the Stellar-Spend team for a sandbox key.

```http
POST /api/api-keys
Authorization: Bearer <API_KEY_ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "My Integration — Sandbox",
  "rateLimitMaxRequests": 120,
  "rateLimitWindowMs": 60000
}
```

The response includes a `plaintextKey` — store it securely. **It is shown only once.**

```json
{
  "data": {
    "id": "key-uuid",
    "name": "My Integration — Sandbox",
    "keyPrefix": "abc123",
    "status": "active",
    "plaintextKey": "ssp_live_abc123def456.very-secret-value"
  }
}
```

### Scopes

| Scope | Endpoints covered |
|-------|-------------------|
| `offramp:read` | GET currencies, institutions, rate, quote, bridge status |
| `offramp:write` | POST quote, build-tx, submit-soroban, paycrest order |
| `webhook:read` | Receive webhook events |
| `admin` | API key management (not available to integrators) |

Scopes are assigned when the key is created. Contact support to adjust scopes.

### Using your API key

Send the key in one of two ways on every request to `/api/v1/`:

```http
# Option A — header
X-API-Key: ssp_live_abc123def456.very-secret-value

# Option B — Bearer token
Authorization: Bearer ssp_live_abc123def456.very-secret-value
```

---

## Sandbox vs Production Setup

| Setting | Sandbox | Production |
|---------|---------|------------|
| Base URL | `https://sandbox.stellar-spend.example.com` | `https://app.stellar-spend.example.com` |
| Paycrest key | Sandbox key from Paycrest dashboard | Production key |
| Stellar network | Testnet | Mainnet |
| Allbridge | Testnet bridge contracts | Mainnet bridge contracts |
| Real funds | ❌ No | ✅ Yes |
| Webhook delivery | To your registered sandbox endpoint | To your production endpoint |

### Sandbox environment variables for local testing

```env
PAYCREST_API_KEY=sandbox_your_key
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.testnet.stellar.gateway.fm
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.testnet.stellar.gateway.fm
NEXT_PUBLIC_STELLAR_USDC_ISSUER=<testnet USDC issuer>
BASE_RPC_URL=https://goerli.base.org
```

> On testnet, use Stellar's [Friendbot](https://friendbot.stellar.org) to fund test accounts:
> `curl "https://friendbot.stellar.org?addr=<YOUR_G_ADDRESS>"`

---

## Quickstart

Install a minimal HTTP client (no SDK required — the API is plain REST):

```bash
npm install node-fetch  # or use the built-in fetch in Node 18+
```

### 1. Get supported currencies

```ts
const res = await fetch('https://sandbox.stellar-spend.example.com/api/v1/offramp/currencies', {
  headers: { 'X-API-Key': process.env.STELLAR_SPEND_API_KEY! },
});
const { data } = await res.json();
// data: [{ code: 'NGN', name: 'Nigerian Naira', symbol: '₦' }, ...]
```

### 2. Get a quote

```ts
const res = await fetch('https://sandbox.stellar-spend.example.com/api/v1/offramp/quote', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.STELLAR_SPEND_API_KEY!,
  },
  body: JSON.stringify({ amount: '100', currency: 'NGN', feeMethod: 'USDC' }),
});
const quote = await res.json();
// { destinationAmount: '155000.00', rate: 1550, currency: 'NGN', expiresIn: 300 }
```

### 3. Build a bridge transaction

```ts
const res = await fetch('https://sandbox.stellar-spend.example.com/api/v1/offramp/bridge/build-tx', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.STELLAR_SPEND_API_KEY!,
  },
  body: JSON.stringify({
    amount: '99.5',
    fromAddress: 'GABC...XYZ',      // user's Stellar G-address
    toAddress: '0xabc...def',        // server's Base payout address
    feePaymentMethod: 'stablecoin',
  }),
});
const { xdr } = await res.json();
// xdr: "AAAAAgAAAA..." — hand this to the user's wallet for signing
```

---

## TypeScript Client Example

Below is a minimal, production-ready TypeScript client you can copy into your project:

```typescript
// stellar-spend-client.ts

export interface StellarSpendConfig {
  baseUrl: string;
  apiKey: string;
}

export interface Quote {
  destinationAmount: string;
  rate: number;
  currency: string;
  expiresIn: number;
}

export interface BuildTxResult {
  xdr: string;
  sourceToken: { symbol: string; decimals: number; chain: string };
  destinationToken: { symbol: string; decimals: number; chain: string };
}

export interface PaycrestOrder {
  id: string;
  receiveAddress: string;
}

export interface OrderStatus {
  id: string;
  status: 'pending' | 'validated' | 'settled' | 'refunded' | 'expired';
}

export class StellarSpendClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: StellarSpendConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new StellarSpendError(res.status, (body as { error?: string }).error ?? res.statusText, body);
    }
    return res.json() as Promise<T>;
  }

  /** List supported fiat currencies. */
  getCurrencies() {
    return this.request<{ data: { code: string; name: string; symbol: string }[] }>(
      '/api/v1/offramp/currencies',
    );
  }

  /** List banks/institutions for a fiat currency (e.g. "NGN"). */
  getInstitutions(currency: string) {
    return this.request<{ code: string; name: string }[]>(
      `/api/v1/offramp/institutions/${currency}`,
    );
  }

  /** Get a USDC → fiat conversion quote. */
  getQuote(params: { amount: string; currency: string; feeMethod: 'USDC' | 'XLM' }): Promise<Quote> {
    return this.request<Quote>('/api/v1/offramp/quote', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /** Verify a beneficiary bank account. Returns the account holder name. */
  verifyAccount(params: { institution: string; accountIdentifier: string }) {
    return this.request<{ accountName: string }>('/api/v1/offramp/verify-account', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /** Build an unsigned Soroban XDR for the bridge transfer. */
  buildBridgeTx(params: {
    amount: string;
    fromAddress: string;
    toAddress: string;
    feePaymentMethod?: 'stablecoin' | 'native';
  }): Promise<BuildTxResult> {
    return this.request<BuildTxResult>('/api/v1/offramp/bridge/build-tx', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /** Submit a signed Soroban XDR transaction. */
  submitSoroban(signedXdr: string) {
    return this.request<{ status: string; hash: string }>('/api/v1/offramp/bridge/submit-soroban', {
      method: 'POST',
      body: JSON.stringify({ signedXdr }),
    });
  }

  /** Poll Allbridge for cross-chain transfer status. */
  getBridgeStatus(txHash: string) {
    return this.request<{ data: { status: string; txHash: string; receiveAmount: string } }>(
      `/api/v1/offramp/bridge/status/${txHash}`,
    );
  }

  /**
   * Create a Paycrest payout order.
   * Pass a stable `idempotencyKey` to safely retry on network failure.
   */
  createPaycrestOrder(
    params: {
      amount: number;
      rate: number;
      token: string;
      network: string;
      reference: string;
      returnAddress: string;
      recipient: {
        institution: string;
        accountIdentifier: string;
        accountName: string;
        currency: string;
      };
    },
    idempotencyKey?: string,
  ): Promise<{ data: PaycrestOrder }> {
    return this.request('/api/v1/offramp/paycrest/order', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(params),
    });
  }

  /** Poll payout order status. */
  getOrderStatus(orderId: string): Promise<{ data: OrderStatus }> {
    return this.request(`/api/v1/offramp/paycrest/order/${orderId}`);
  }
}

export class StellarSpendError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(`StellarSpend API error ${status}: ${message}`);
    this.name = 'StellarSpendError';
  }
}
```

### Usage

```typescript
import { StellarSpendClient } from './stellar-spend-client';

const client = new StellarSpendClient({
  baseUrl: 'https://sandbox.stellar-spend.example.com',
  apiKey: process.env.STELLAR_SPEND_API_KEY!,
});

// 1. Fetch currencies
const { data: currencies } = await client.getCurrencies();

// 2. Quote 100 USDC → NGN
const quote = await client.getQuote({ amount: '100', currency: 'NGN', feeMethod: 'USDC' });
console.log(`You'll receive ${quote.destinationAmount} NGN`);

// 3. Build bridge tx (user signs on the frontend)
const { xdr } = await client.buildBridgeTx({
  amount: '99.5',
  fromAddress: userStellarAddress,
  toAddress: serverBaseAddress,
  feePaymentMethod: 'stablecoin',
});

// 4. After user signs — submit
const { hash } = await client.submitSoroban(signedXdr);

// 5. Create payout order with idempotency key
const { data: order } = await client.createPaycrestOrder(
  {
    amount: 99.5,
    rate: quote.rate,
    token: 'USDC',
    network: 'base',
    reference: `tx-${Date.now()}`,
    returnAddress: serverBaseAddress,
    recipient: {
      institution: 'ACCESS',
      accountIdentifier: '0123456789',
      accountName: 'John Doe',
      currency: 'NGN',
    },
  },
  `order-${hash}`, // idempotency key — safe to retry
);

// 6. Poll until settled
let status = 'pending';
while (!['settled', 'refunded', 'expired'].includes(status)) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await client.getOrderStatus(order.id);
  status = res.data.status;
}
```

---

## Core Flows

### Quote Flow

```
GET  /api/v1/offramp/currencies          → list supported fiat currencies
GET  /api/v1/offramp/institutions/:code  → list banks for a currency
POST /api/v1/offramp/verify-account      → verify beneficiary account
POST /api/v1/offramp/quote               → get USDC → fiat quote (valid 5 min)
```

Quotes expire after `expiresIn` seconds (default 300). Always re-quote before creating an order.

### Bridge Transaction Flow

```
GET  /api/v1/offramp/bridge/gas-fee-options        → XLM vs USDC fee amounts
POST /api/v1/offramp/bridge/build-tx               → get unsigned Soroban XDR
POST /api/v1/offramp/bridge/submit-soroban         → submit signed XDR
GET  /api/v1/offramp/bridge/tx-status/:hash        → poll Soroban confirmation
GET  /api/v1/offramp/bridge/status/:txHash         → poll Allbridge cross-chain status
```

The XDR returned by `build-tx` must be signed by the user's Stellar wallet (Freighter / Lobstr) before submission. The server never receives the private key.

### Payout Order Flow

```
POST /api/v1/offramp/paycrest/order          → create Paycrest fiat payout order
GET  /api/v1/offramp/paycrest/order/:id      → poll order status
```

**Terminal statuses:** `settled`, `refunded`, `expired`

Order lifecycle:
```
pending → validated → settled   (success)
pending → validated → refunded  (Paycrest refund)
pending → expired               (no funds received within timeout)
```

### Webhook Handling

Register a webhook endpoint with Paycrest to receive real-time order events. The Stellar-Spend server forwards these events with an HMAC-SHA256 signature.

**Supported events:**

| Event | Description |
|-------|-------------|
| `payment_order.pending` | Order created, awaiting USDC deposit |
| `payment_order.validated` | USDC received; fiat disbursement initiated |
| `payment_order.settled` | Bank transfer completed |
| `payment_order.refunded` | Paycrest refunded USDC |
| `payment_order.expired` | No USDC deposit within timeout |

#### Verifying webhook signatures

Every inbound webhook from Paycrest includes:

```
X-Paycrest-Signature: <hmac-sha256-hex-of-raw-body>
```

**Verify in Node.js:**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyPaycrestWebhook(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Express example
app.post('/webhooks/paycrest', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-paycrest-signature'] as string;
  if (!verifyPaycrestWebhook(req.body, sig, process.env.PAYCREST_WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body.toString());
  switch (event.event) {
    case 'payment_order.settled':
      // mark order complete in your DB
      break;
    case 'payment_order.refunded':
      // notify user of refund
      break;
  }

  res.json({ received: true });
});
```

> **Important:** Always use `timingSafeEqual` (not `===`) to prevent timing attacks.
> Read the raw request body before any JSON parsing — parsers may normalise whitespace and invalidate the signature.

---

## Auth, Rate Limits, and Idempotency

### Authentication

All `/api/v1/` endpoints require an API key sent as:

```
X-API-Key: ssp_live_<key>
```

or

```
Authorization: Bearer ssp_live_<key>
```

Requests without a valid key return `401 Unauthorized`.

### Rate limits

Default limits per API key:

| Limit | Default |
|-------|---------|
| Requests per minute | 120 |
| Burst (short window) | 20 per 5 seconds |

When the limit is exceeded you receive `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12
Content-Type: application/json

{ "error": "Rate limit exceeded" }
```

Limits can be customised when the API key is created — contact support for higher limits.

### Idempotency

All mutating endpoints (`POST`) accept an `Idempotency-Key` header. If you send the same key twice, the second request replays the first response without creating a duplicate resource.

```http
POST /api/v1/offramp/paycrest/order
Idempotency-Key: order-<your-unique-reference>
```

Response headers:

| Header | Value | Meaning |
|--------|-------|---------|
| `Idempotency-Key` | `order-<ref>` | Echo of your key |
| `Idempotency-Status` | `created` | First time this key was seen |
| `Idempotency-Status` | `replayed` | Cached response — no new resource |
| `Idempotency-Status` | `conflict` | Same key, different request body |

A `conflict` returns `409 Conflict`. Use a fresh key for a genuinely different request.

**Best practices:**
- Use a stable, request-specific ID (e.g., `order-${txHash}`) so retries on network failure are safe.
- Keys expire after 24 hours (configurable via `IDEMPOTENCY_TTL_MS`).

---

## Error Handling

All errors follow a consistent shape:

```json
{ "error": "Human-readable description" }
```

Validation errors include a `details` map:

```json
{
  "error": "Validation failed",
  "details": {
    "amount": "amount must be a positive number",
    "recipient.institution": "recipient.institution is required"
  }
}
```

### HTTP status codes

| Code | Meaning | Action |
|------|---------|--------|
| `400` | Validation error | Fix the request body |
| `401` | Invalid or missing API key | Check the key and header name |
| `409` | Idempotency conflict | Use a different `Idempotency-Key` |
| `429` | Rate limit | Wait `Retry-After` seconds and retry |
| `500` | Internal server error | Retry with backoff; contact support if persistent |
| `502` | Upstream unavailable (Allbridge / Paycrest) | Retry with exponential backoff |

### Retry strategy

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof StellarSpendError && ![429, 500, 502].includes(err.status)) {
        throw err; // don't retry 4xx client errors
      }
      lastError = err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
```

---

## Production Onboarding Checklist

Before going live, complete every item:

### API credentials

- [ ] API key issued for production (separate from sandbox)
- [ ] `PAYCREST_API_KEY` is a production key (not sandbox)
- [ ] `PAYCREST_WEBHOOK_SECRET` is set and matches the Paycrest dashboard
- [ ] API key stored in your secrets manager (not in source code)
- [ ] Key rotation procedure documented and tested

### Integration

- [ ] Webhook signature verification implemented and tested (`timingSafeEqual`)
- [ ] Idempotency keys used on all `POST` endpoints
- [ ] Retry with exponential backoff implemented for `429` and `5xx` responses
- [ ] Quote re-fetched before creating a payout order (quotes expire in 5 min)
- [ ] Terminal order statuses (`settled`, `refunded`, `expired`) handled in your UI

### Stellar

- [ ] Production Stellar wallet configured (Freighter or Lobstr on Mainnet)
- [ ] Correct `NEXT_PUBLIC_STELLAR_USDC_ISSUER` for Mainnet (Circle's issuer)
- [ ] Testnet USDC trustline removed from production wallets
- [ ] Users informed that Freighter must be set to **Mainnet**

### Security

- [ ] `BASE_PRIVATE_KEY` stored in a hardware security module or KMS — never in `.env`
- [ ] CORS `ALLOWED_ORIGINS` set to your production domain(s) only
- [ ] HTTPS enforced on all endpoints
- [ ] Webhook endpoint only accepts traffic from Paycrest's IP ranges
- [ ] Sensitive env vars (`PAYCREST_API_KEY`, `BASE_PRIVATE_KEY`) not prefixed with `NEXT_PUBLIC_`

### Monitoring

- [ ] `SENTRY_DSN` configured for error tracking
- [ ] `/api/health` polled by your uptime monitor
- [ ] Alerts configured for `payment_order.expired` and `payment_order.refunded` events
- [ ] Transaction reconciliation scheduled (see `docs/deployment-guide.md`)

### Testing

- [ ] End-to-end test run successfully against sandbox
- [ ] Load test performed to verify your rate limit allocation is sufficient
- [ ] Webhook replay tested (Paycrest dashboard → Resend event)

---

## Full API Reference

Interactive API documentation (Swagger UI) is available at:

```
https://app.stellar-spend.example.com/api/docs
```

Or locally at `http://localhost:3001/api/docs` when running the dev server.

The raw OpenAPI 3.0 spec lives in [`openapi.yaml`](../openapi.yaml) at the root of the repository.

For questions, open an issue at <https://github.com/Lex-Studios/Stellar-Spend/issues> or contact the team on Telegram: [t.me/Xoulomon](https://t.me/Xoulomon).
