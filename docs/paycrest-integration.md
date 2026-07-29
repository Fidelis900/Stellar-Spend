# Paycrest Integration Guide

This guide covers everything needed to integrate with the Paycrest API within Stellar-Spend — from initial setup through order lifecycle, webhook handling, error handling, and sandbox testing.

---

## 1. API Setup

### Credentials

Two secrets are required. Both are server-only and must never be prefixed with `NEXT_PUBLIC_`.

| Variable                  | Description                                   |
| ------------------------- | --------------------------------------------- |
| `PAYCREST_API_KEY`        | Sender API key from the Paycrest dashboard    |
| `PAYCREST_WEBHOOK_SECRET` | Signing secret for verifying webhook payloads |

Add them to `.env.local`:

```env
PAYCREST_API_KEY=your_api_key_here
PAYCREST_WEBHOOK_SECRET=your_webhook_secret_here
```

The app validates these at startup and throws a clear error if either is missing or accidentally exposed as a public variable.

### Base URL

All Paycrest API calls go through `PaycrestAdapter`, which targets:

```
https://api.paycrest.io/v1
```

### Authentication

Every request sends the API key in the `API-Key` header:

```
API-Key: <PAYCREST_API_KEY>
Content-Type: application/json
```

### Timeout

Requests time out after **15 seconds**. A timeout surfaces as a `PaycrestHttpError` with status `504`.

### Available Endpoints (via `PaycrestAdapter`)

| Method | Paycrest Endpoint                 | Adapter Method                                  |
| ------ | --------------------------------- | ----------------------------------------------- |
| `GET`  | `/sender/currencies`              | `getCurrencies()`                               |
| `GET`  | `/sender/institutions/:currency`  | `getInstitutions(currency)`                     |
| `POST` | `/sender/verify-account`          | `verifyAccount(institution, accountIdentifier)` |
| `GET`  | `/rates/:token/:amount/:currency` | `getRate(token, amount, currency, options?)`    |
| `POST` | `/sender/orders`                  | `createOrder(request)`                          |
| `GET`  | `/sender/orders/:orderId`         | `getOrderStatus(orderId)`                       |

---

## 2. Webhook Configuration

Paycrest sends signed `POST` requests to `/api/webhooks/paycrest` when an order's status changes.

### Registering the Webhook

In the Paycrest dashboard, set your webhook URL to:

```
https://<your-domain>/api/webhooks/paycrest
```

### Signature Verification

Every incoming request is verified before processing. The handler:

1. Reads the **raw request body** (before any JSON parsing — parsing first can alter the byte sequence).
2. Computes an HMAC-SHA-256 of the raw body using `PAYCREST_WEBHOOK_SECRET`.
3. Compares the result to the `X-Paycrest-Signature` header using a constant-time XOR loop to prevent timing attacks.
4. Returns `401 Unauthorized` if the signature is missing or invalid.

```ts
// Simplified signature check (see src/app/api/webhooks/paycrest/route.ts for full impl)
const rawBody = await request.text();
const signature = request.headers.get('X-Paycrest-Signature') ?? '';
const isValid = await verifySignature(rawBody, signature, env.server.PAYCREST_WEBHOOK_SECRET);
if (!isValid) return ErrorHandler.unauthorized('Invalid signature');
```

### Webhook Payload Shape

```json
{
  "event": "payment_order.settled",
  "data": {
    "id": "order-uuid",
    "status": "settled"
  }
}
```

The `event` field is mapped to an internal `PayoutStatus` via `mapPaycrestStatus()` (see [Order Lifecycle](#3-order-lifecycle)).

### Response

Always return `200` with `{ "received": true }` after successful processing. Paycrest will retry on non-2xx responses.

---

## 3. Order Lifecycle

### Creating an Order

**Route:** `POST /api/offramp/paycrest/order`

**Request body:**

```json
{
  "amount": 100,
  "rate": 1600,
  "token": "USDC",
  "network": "base",
  "reference": "unique-ref-001",
  "returnAddress": "0xYourBaseReturnAddress",
  "recipient": {
    "institution": "ACCESS",
    "accountIdentifier": "1234567890",
    "accountName": "Jane Doe",
    "currency": "NGN"
  }
}
```

**Field notes:**

- `amount` — USDC amount to send. Floored to 6 decimal places (never rounded up) to ensure the deposit is never short.
- `rate` — FX rate locked at quote time. Rounded to 6 decimal places.
- `reference` — must be unique per order; used for idempotency.
- `returnAddress` — Base address Paycrest uses if the order cannot be completed.

**Successful response:**

```json
{
  "data": {
    "id": "order-uuid",
    "receiveAddress": "0xPaycrestDepositAddress"
  }
}
```

After receiving `receiveAddress`, the server transfers USDC on Base to that address to fund the order.

### Polling Order Status

**Route:** `GET /api/offramp/paycrest/order/:orderId`

**Response:**

```json
{
  "data": {
    "id": "order-uuid",
    "status": "settled"
  }
}
```

### Status Lifecycle

Paycrest emits the following webhook events, which map to internal statuses:

| Webhook Event             | Internal `PayoutStatus` |
| ------------------------- | ----------------------- |
| `payment_order.pending`   | `pending`               |
| `payment_order.validated` | `validated`             |
| `payment_order.settled`   | `settled`               |
| `payment_order.refunded`  | `refunded`              |
| `payment_order.expired`   | `expired`               |

**Terminal states:** `settled`, `refunded`, `expired` — stop polling when any of these is reached.

**Unknown events** default to `pending`.

```
pending → validated → settled   ✅ (success path)
pending → validated → refunded  ↩️ (funds returned)
pending → expired               ⏱️ (deposit not received in time)
```

---

## 4. Error Handling

### `PaycrestHttpError`

All Paycrest API errors are wrapped in `PaycrestHttpError`:

```ts
class PaycrestHttpError extends Error {
  status: number; // HTTP status from Paycrest (or 502/504 for network/timeout)
  details: unknown; // Raw Paycrest error body
}
```

| Status | Cause                               |
| ------ | ----------------------------------- |
| `400`  | Validation error (bad request body) |
| `401`  | Invalid or missing `API-Key`        |
| `404`  | Order not found                     |
| `429`  | Paycrest rate limit exceeded        |
| `502`  | Network error reaching Paycrest     |
| `504`  | Request timed out (>15 s)           |

### Route-Level Error Handling

The order creation route (`POST /api/offramp/paycrest/order`) handles errors as follows:

- **Validation errors** (missing/invalid fields) → `400` with a `details` map of field-level messages.
- **`PaycrestHttpError`** → proxied with the original status code and message.
- **Unexpected errors** → `500` with the error message (stack traces are never leaked to the client).

All responses include an `X-Request-Id` header for tracing.

### Rate Limiting

The order creation route enforces a server-side rate limit per client IP. Exceeding it returns:

```json
HTTP 429
Retry-After: <seconds>
{ "error": "Too many requests" }
```

---

## 5. Testing with the Sandbox Environment

### Unit Tests

The test suite uses [Vitest](https://vitest.dev/) and mocks both `fetch` and `PaycrestAdapter` — no real API calls are made.

Run all Paycrest-related tests:

```bash
npx vitest run src/test/paycrest-adapter.test.ts src/test/paycrest-order.test.ts src/test/webhooks-paycrest.test.ts
```

Or run the full suite:

```bash
npm test
```

### What's Covered

| Test File                   | Coverage                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `paycrest-adapter.test.ts`  | `mapPaycrestStatus`, `getCurrencies`, `getInstitutions`, `verifyAccount`, `getRate`        |
| `paycrest-order.test.ts`    | `POST /api/offramp/paycrest/order` — happy path, validation errors, HTTP error propagation |
| `webhooks-paycrest.test.ts` | `POST /api/webhooks/paycrest` — signature verification, payload parsing                    |

### Mocking the Adapter in Tests

```ts
vi.mock('@/lib/offramp/adapters/paycrest-adapter', () => ({
  PaycrestAdapter: class {
    createOrder = vi.fn().mockResolvedValue({ id: 'order-1', receiveAddress: '0xabc' });
  },
  PaycrestHttpError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));
```

### Mocking the Webhook Signature

To test the webhook handler, compute a valid HMAC-SHA-256 signature over the raw body using `PAYCREST_WEBHOOK_SECRET` and pass it as the `X-Paycrest-Signature` header. The test suite mocks `env.server.PAYCREST_WEBHOOK_SECRET` to a known value (`'test-secret'`) for deterministic signature generation.

## 6. Adapter Pattern

Paycrest is implemented as a **concrete adapter** conforming to `PayoutProviderAdapter`:

```ts
// src/lib/offramp/adapters/payout-provider.ts
export interface PayoutProviderAdapter {
  getCurrencies(): Promise<Currency[]>;
  getInstitutions(currency): Promise<Institution[]>;
  verifyAccount(institution, accountIdentifier): Promise<string>;
  getRate(token, amount, currency, options?): Promise<number>;
  createOrder(request): Promise<PayoutOrderResponse>;
  getOrderStatus(orderId): Promise<Status>;
  getHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}
```

### Provider Registry

The `BridgeProviderRegistry` (in `src/lib/offramp/adapters/provider-registry.ts`) manages all payout providers:

```ts
import { providerRegistry } from '@/lib/offramp/adapters/provider-registry';

// Register providers
providerRegistry.registerPayout('paycrest', paycrestAdapter);

// Get eligible payouts for a currency
const payouts = providerRegistry.getEligiblePayouts('NGN');

// Check health
const health = await providerRegistry.checkPayoutHealth('paycrest');
```

### Per-Corridor Routing

```ts
providerRegistry.configureRoutes([
  {
    corridor: 'usdc→ngn',
    sourceChain: 'base',
    destinationChain: 'bank',
    token: 'USDC',
    fiatCurrency: 'NGN',
    bridgeProvider: 'allbridge',
    payoutProvider: 'paycrest',
    priority: 1,
  },
]);
```

### Health Probes

Each provider exposes a `getHealth()` method that the registry calls periodically. The registry tracks:

- `ok`: whether the provider responded
- `latencyMs`: response time
- `lastChecked`: timestamp of last check

Route selection uses health status to skip degraded providers, falling back to the next priority.

### Sandbox API Key

Paycrest provides a sandbox environment for end-to-end testing without real funds. Obtain a sandbox key from the Paycrest dashboard and set it in `.env.local`:

```env
PAYCREST_API_KEY=sandbox_your_key_here
```

The `PaycrestAdapter` base URL (`https://api.paycrest.io/v1`) is the same for both sandbox and production — the key determines the environment.
