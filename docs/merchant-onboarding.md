# Merchant Onboarding

This guide explains how to register as a merchant on Stellar-Spend and use the merchant payout API.

---

## 1. Register as a Merchant

Create your merchant account via the API:

```http
POST /api/merchant
Content-Type: application/json

{
  "userId": "<your-user-id>",
  "businessName": "Acme Corp",
  "businessEmail": "payments@acme.example"
}
```

**Response (201)**:
```json
{
  "data": {
    "id": "uuid",
    "userId": "...",
    "businessName": "Acme Corp",
    "businessEmail": "payments@acme.example",
    "role": "owner",
    "status": "active",
    "createdAt": "2026-06-29T00:00:00Z",
    "updatedAt": "2026-06-29T00:00:00Z"
  }
}
```

Store the returned `id` — it is your `merchantId` for all subsequent calls.

---

## 2. API Authentication

All merchant API calls require an `Authorization` header with your API key:

```
Authorization: Bearer <api-key>
```

API keys are scoped. The merchant endpoints require the `merchant:write` scope for mutations and `merchant:read` for read-only operations. Generate keys via `POST /api/api-keys`.

---

## 3. Creating Bulk Payouts

Send a single request with all recipients. Use a unique `idempotencyKey` per batch — repeating the same key returns the original result without creating a duplicate.

```http
POST /api/merchant/payouts
Content-Type: application/json
Idempotency-Key: <unique-key>

{
  "merchantId": "<your-merchant-id>",
  "idempotencyKey": "batch-2026-06-29-001",
  "items": [
    {
      "beneficiaryInstitution": "GTB",
      "beneficiaryAccount": "0123456789",
      "beneficiaryName": "Jane Doe",
      "amount": 5000,
      "currency": "NGN"
    },
    {
      "beneficiaryInstitution": "UBA",
      "beneficiaryAccount": "9876543210",
      "beneficiaryName": "John Smith",
      "amount": 12000,
      "currency": "NGN"
    }
  ]
}
```

**Response (201)**:
```json
{
  "data": {
    "id": "payout-uuid",
    "merchantId": "...",
    "idempotencyKey": "batch-2026-06-29-001",
    "totalAmount": 17000,
    "currency": "NGN",
    "status": "pending",
    "createdAt": "2026-06-29T00:00:00Z"
  }
}
```

### Poll Payout Status

```http
GET /api/merchant/payouts/{payoutId}
```

Returns the payout with all items and their individual statuses (`pending`, `processing`, `completed`, `failed`).

### List Payouts

```http
GET /api/merchant/payouts?merchantId=<id>&page=1&limit=20
```

---

## 4. Webhook Setup

Register a webhook URL to receive real-time payout status events:

```http
PATCH /api/merchant
Content-Type: application/json

{
  "merchantId": "<your-merchant-id>",
  "webhookUrl": "https://your-server.example/webhooks/stellar-spend"
}
```

Webhook payloads are HMAC-SHA256 signed using your `PAYCREST_WEBHOOK_SECRET`. Verify the `X-Webhook-Signature` header before processing:

```typescript
import crypto from 'crypto';

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### Event Types

| Event | Triggered when |
|-------|----------------|
| `payout.completed` | All items settled |
| `payout.failed` | Batch has failures |
| `payout.item.completed` | Single item settled |
| `payout.item.failed` | Single item failed |

---

## 5. Analytics & Statements

### Dashboard Stats

```http
GET /api/merchant/stats?merchantId=<id>
```

Returns:
```json
{
  "data": {
    "totalPayouts": 42,
    "completedPayouts": 39,
    "failedPayouts": 3,
    "successRate": 93,
    "totalVolume": 1850000
  }
}
```

### Statement Export

Use the existing export endpoint with a `merchantId` filter:

```http
GET /api/offramp/export?merchantId=<id>&from=2026-01-01&to=2026-06-30&format=csv
```

Supported formats: `csv`, `json`.

---

## 6. Reconciliation

Compare your internal records against Stellar-Spend payouts by:

1. Fetching all payouts for the period: `GET /api/merchant/payouts?merchantId=<id>&page=1&limit=100`
2. Matching `idempotencyKey` to your internal batch IDs
3. Flagging items where status ≠ `completed` for manual review

Any discrepancy can be reported via the dispute flow: `POST /api/transactions/dispute`.
