# Webhook Integration Guide

This guide describes how to integrate with Stellar-Spend webhooks: which events fire, what payloads look like, how to verify signatures, and how delivery retries work.

## Table of Contents

- [Overview](#overview)
- [Event Types](#event-types)
- [Payload Schemas](#payload-schemas)
- [Signature Verification](#signature-verification)
- [Retry Policy](#retry-policy)
- [Endpoint Requirements](#endpoint-requirements)
- [Testing Webhooks Locally](#testing-webhooks-locally)
- [Security Best Practices](#security-best-practices)
- [Example Handlers](#example-handlers)
- [Schema Versioning](#schema-versioning)
- [Troubleshooting](#troubleshooting)

## Overview

Stellar-Spend sends webhook deliveries as HTTP `POST` requests with a JSON body and an HMAC-SHA256 signature. Inbound webhooks (Paycrest → Stellar-Spend) follow the same security model in reverse — both directions verify a shared secret.

| Property | Value |
|---|---|
| HTTP method | `POST` |
| Content type | `application/json` |
| Signature algorithm | HMAC-SHA256, hex-encoded |
| Signature header | `X-Webhook-Signature` (outgoing), `X-Paycrest-Signature` (inbound) |
| Timestamp header | `X-Webhook-Timestamp` (Unix epoch ms) |
| Max body size | 1 MB |
| Required response | 2xx within 10 seconds |

## Event Types

Stellar-Spend currently emits and consumes the following events.

### Outbound (Stellar-Spend → your endpoint)

| Event | Triggered when |
|---|---|
| `transaction.created` | A new transaction record is created |
| `transaction.updated` | A transaction's status changes |
| `transaction.completed` | A transaction reaches a terminal `completed` state |
| `transaction.failed` | A transaction reaches a terminal `failed` state |
| `payout.settled` | Off-ramp payout settles to fiat |
| `payout.refunded` | Off-ramp payout is refunded |
| `payout.expired` | Off-ramp order expires before fulfilment |

### Inbound (Paycrest → Stellar-Spend)

These are documented for parity; they are handled by `/api/webhooks/paycrest`.

| Event | Maps to internal status |
|---|---|
| `payment_order.pending` | `payoutStatus = pending` |
| `payment_order.settled` | `status = completed`, `payoutStatus = settled` |
| `payment_order.refunded` | `status = failed`, `payoutStatus = refunded` |
| `payment_order.expired` | `status = failed`, `payoutStatus = expired` |

## Payload Schemas

Every payload has this envelope:

```json
{
  "event": "transaction.completed",
  "id": "evt_01HXYZ...",
  "createdAt": "2026-05-26T12:00:00.000Z",
  "data": { ... }
}
```

### `transaction.*`

```json
{
  "event": "transaction.completed",
  "id": "evt_01HXYZ...",
  "createdAt": "2026-05-26T12:00:00.000Z",
  "data": {
    "id": "tx_01HABC...",
    "status": "completed",
    "payoutStatus": "settled",
    "amount": "100.00",
    "currency": "USDC",
    "fiatAmount": "100.00",
    "fiatCurrency": "NGN",
    "walletAddress": "GABC...",
    "txHash": "0xabc...",
    "createdAt": "2026-05-26T11:58:00.000Z",
    "updatedAt": "2026-05-26T12:00:00.000Z"
  }
}
```

### `payout.*`

```json
{
  "event": "payout.settled",
  "id": "evt_01HXYZ...",
  "createdAt": "2026-05-26T12:00:00.000Z",
  "data": {
    "transactionId": "tx_01HABC...",
    "orderId": "ord_paycrest_123",
    "payoutStatus": "settled",
    "settledAt": "2026-05-26T11:59:55.000Z"
  }
}
```

Fields are append-only — new optional fields may be added without notice. Ignore unknown fields.

## Signature Verification

Every outgoing request carries two headers:

- `X-Webhook-Timestamp` — Unix epoch in milliseconds when the request was signed.
- `X-Webhook-Signature` — hex-encoded HMAC-SHA256 of `${timestamp}.${rawBody}` using the shared secret.

Implementation lives in `src/lib/webhook/security.ts:99`.

### Verification steps

1. Read the **raw** request body. Do not parse it first — JSON re-serialization changes byte order and breaks the signature.
2. Compute `expected = hmac_sha256(secret, timestamp + "." + rawBody)`.
3. Compare in constant time against `X-Webhook-Signature`.
4. Reject if `|now - timestamp| > 5 minutes` (replay window).
5. Reject if you have seen this signature recently (Stellar-Spend's verifier dedupes by `(timestamp, signature)` for 5 minutes — see `security.ts:8`).

If any check fails, return `401 Unauthorized` and do not process the payload.

## Retry Policy

Failed deliveries are retried with exponential backoff and jitter. Source: `src/lib/webhook/retry-scheduler.ts` and `src/lib/webhook/config.ts:42`.

| Setting | Default | Env var |
|---|---|---|
| Base delay | 30 s | `WEBHOOK_RETRY_BASE_DELAY_SECONDS` |
| Max attempts | 5 | `WEBHOOK_RETRY_MAX_ATTEMPTS` |
| Jitter | ±25 % | (fixed) |
| Alert suppression window | 300 s | `WEBHOOK_ALERT_SUPPRESSION_SECONDS` |
| DLQ retention | 30 days | (fixed) |

Backoff schedule (attempts 1–5 with base 30 s):

| Attempt | Delay before |
|---|---|
| 1 | 0 s |
| 2 | ~30 s |
| 3 | ~60 s |
| 4 | ~120 s |
| 5 | ~240 s |

### Retryable vs. terminal status codes

`src/lib/webhook/dispatcher.ts:50` classifies responses:

- `2xx` → success, no retry.
- `4xx` (except `429`) → terminal failure, no retry. Fix the endpoint and replay from the dashboard.
- `429` → retryable. Honour `Retry-After` if present.
- `5xx` → retryable.
- Network error / timeout → retryable.

After max attempts, the delivery enters the dead-letter queue with a `webhook.failed` log event and a Slack/email alert via `alert-service.ts`.

## Endpoint Requirements

Your endpoint MUST:

- Accept HTTPS only. Plain `http://` URLs are rejected at config time.
- Respond with a 2xx status within **10 seconds**. Long work should be queued asynchronously.
- Be idempotent on the `id` field of the envelope (same `evt_*` may arrive more than once during retries).
- Tolerate unknown event types and fields — return `200 OK` for events you do not handle so they are not retried.

## Testing Webhooks Locally

### Option 1: ngrok or cloudflared

```bash
ngrok http 3001
# copy the https://*.ngrok.app URL into the dashboard
```

### Option 2: replay a captured payload

```bash
SECRET="your_test_secret"
TS=$(node -e 'console.log(Date.now())')
BODY='{"event":"transaction.completed","id":"evt_test","data":{}}'
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256','$SECRET').update('$TS.'+'$BODY').digest('hex'))")

curl -X POST http://localhost:3001/api/webhooks/paycrest \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Timestamp: $TS" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$BODY"
```

### Option 3: built-in retry runner

The retry runner at `src/app/api/webhooks/retry-runner` can be triggered manually:

```bash
curl -X POST http://localhost:3001/api/webhooks/retry-runner \
  -H "Authorization: Bearer $INTERNAL_TOKEN"
```

## Security Best Practices

- **Never log signatures or secrets.** Outbound logs in `dispatcher.ts:80` already redact them — keep it that way on your side.
- **Use a per-environment secret.** Do not reuse production secrets in staging.
- **Rotate secrets** at least quarterly. Stellar-Spend supports overlap: configure `*_PRIMARY` and `*_SECONDARY` env vars during rotation.
- **Pin the signature scheme.** Reject requests without `X-Webhook-Signature` even if you have other auth in front (defence in depth).
- **Reject stale timestamps** (> 5 minutes) to prevent replay attacks.
- **Limit egress allowlists** to known destination domains.
- **Store the raw body** for at least 24 hours so you can re-verify if a customer disputes a delivery.

## Example Handlers

### Node.js (Express)

```js
import express from "express";
import crypto from "node:crypto";

const app = express();
const SECRET = process.env.STELLAR_SPEND_WEBHOOK_SECRET;

app.post(
  "/webhooks/stellar-spend",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res) => {
    const ts = req.header("X-Webhook-Timestamp") ?? "";
    const sig = req.header("X-Webhook-Signature") ?? "";
    const body = req.body.toString("utf8");

    if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) {
      return res.status(401).send("stale");
    }

    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${ts}.${body}`)
      .digest("hex");

    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return res.status(401).send("bad signature");
    }

    const event = JSON.parse(body);
    // enqueue async work, do not block
    res.status(200).json({ received: true });
  }
);
```

### Python (FastAPI)

```python
import hmac, hashlib, os, time
from fastapi import FastAPI, Request, HTTPException

SECRET = os.environ["STELLAR_SPEND_WEBHOOK_SECRET"].encode()
app = FastAPI()

@app.post("/webhooks/stellar-spend")
async def receive(request: Request):
    body = await request.body()
    ts = request.headers.get("X-Webhook-Timestamp", "")
    sig = request.headers.get("X-Webhook-Signature", "")

    if abs(int(time.time() * 1000) - int(ts)) > 5 * 60 * 1000:
        raise HTTPException(401, "stale")

    expected = hmac.new(SECRET, f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(401, "bad signature")

    # enqueue async work
    return {"received": True}
```

### Go (net/http)

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "net/http"
    "os"
    "strconv"
    "time"
)

var secret = []byte(os.Getenv("STELLAR_SPEND_WEBHOOK_SECRET"))

func handler(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)
    ts := r.Header.Get("X-Webhook-Timestamp")
    sig := r.Header.Get("X-Webhook-Signature")

    tsInt, err := strconv.ParseInt(ts, 10, 64)
    if err != nil || abs(time.Now().UnixMilli()-tsInt) > 5*60*1000 {
        http.Error(w, "stale", 401)
        return
    }

    mac := hmac.New(sha256.New, secret)
    mac.Write([]byte(ts + "."))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))

    if !hmac.Equal([]byte(expected), []byte(sig)) {
        http.Error(w, "bad signature", 401)
        return
    }

    w.WriteHeader(200)
    w.Write([]byte(`{"received":true}`))
}

func abs(x int64) int64 { if x < 0 { return -x }; return x }
```

### Ruby (Sinatra)

```ruby
require "sinatra"
require "openssl"

SECRET = ENV.fetch("STELLAR_SPEND_WEBHOOK_SECRET")

post "/webhooks/stellar-spend" do
  body = request.body.read
  ts   = request.env["HTTP_X_WEBHOOK_TIMESTAMP"].to_s
  sig  = request.env["HTTP_X_WEBHOOK_SIGNATURE"].to_s

  halt 401, "stale" if (Time.now.to_f * 1000 - ts.to_i).abs > 5 * 60 * 1000

  expected = OpenSSL::HMAC.hexdigest("SHA256", SECRET, "#{ts}.#{body}")
  halt 401, "bad signature" unless Rack::Utils.secure_compare(expected, sig)

  status 200
  '{"received":true}'
end
```

## Subscription Management

Stellar-Spend supports managing outbound webhook subscriptions via API endpoints. This enables third-party integrators to subscribe to transaction lifecycle events.

### Creating a Subscription

```bash
curl -X POST https://api.stellarspend.com/api/webhooks/subscriptions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpointUrl": "https://example.com/webhooks/stellar-spend",
    "events": ["transaction.completed", "transaction.failed"],
    "description": "Production endpoint"
  }'
```

Response includes the `signingSecret` — store it securely. You will need it to verify incoming webhook signatures.

### Managing Subscriptions

- `GET /api/webhooks/subscriptions` — List all subscriptions
- `GET /api/webhooks/subscriptions/:id` — Get a single subscription
- `PUT /api/webhooks/subscriptions/:id` — Update endpoint URL, events, status, rate limit, or pinned schema version (see [Schema Versioning](#schema-versioning))
- `DELETE /api/webhooks/subscriptions/:id` — Delete a subscription

### Delivery Log

Every webhook delivery is recorded. Retrieve delivery logs:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.stellarspend.com/api/webhooks/delivery-log?subscriptionId=sub_xxx&limit=50"
```

### Replaying a Delivery

To replay a failed delivery:

```bash
curl -X POST https://api.stellarspend.com/api/webhooks/subscriptions/:id/replay \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deliveryLogId": "log_xxx"}'
```

### Subscriber Rate Limiting

Each subscription has a per-minute rate limit (default 60 deliveries/minute). When exceeded, excess events are skipped and logged. Adjust via the `rateLimitMaxPerMinute` field on the subscription.

### Available Events

| Event | Description |
|---|---|
| `transaction.created` | A new transaction is created |
| `transaction.completed` | Transaction reaches completed state |
| `transaction.failed` | Transaction reaches failed state |
| `payout.initiated` | Payout has been initiated |
| `payout.completed` | Payout has settled |
| `payout.failed` | Payout has failed |
| `bridge.initiated` | Bridge transfer has started |
| `bridge.completed` | Bridge transfer has completed |

### Verifying Outbound Signatures

Every outbound webhook includes `X-Webhook-Timestamp` and `X-Webhook-Signature` headers. Verify using the `signingSecret` returned when creating the subscription. See [Signature Verification](#signature-verification) above for the verification algorithm.

## Schema Versioning

Outbound webhook payloads are versioned so integrators can opt into a stable schema as it evolves.

| Version | Status | Shape |
|---|---|---|
| `2` | **Default** | `{ event, id, createdAt, data, meta: { schemaVersion: "2" } }` |
| `1` | Deprecated | `{ event, data, timestamp }` (legacy flat envelope, no `meta`) |

- New subscriptions default to the latest schema version (`2`).
- Pin a subscription to a specific version by setting `schemaVersion` when creating or updating it:

```bash
curl -X PUT https://api.stellarspend.com/api/webhooks/subscriptions/:id \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"schemaVersion": "1"}'
```

- Every v2 payload carries its own version in `meta.schemaVersion`, so handlers can branch on shape without an extra lookup.
- Deliveries are transformed server-side from the canonical (latest) payload down to whichever version a subscriber is pinned to — the `data` and `event` fields are never altered, only the envelope.

### Deprecation policy

- A schema version is marked deprecated (see the table above) for at least one release cycle before removal.
- Deprecated versions continue to be served, but new subscriptions should not pin to them.
- When a version's removal is scheduled, subscribers still pinned to it are notified via the subscription's `description`/admin dashboard ahead of the cutoff; after removal, deliveries fall back to the default version.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 on every request | Wrong secret or signing the parsed body instead of raw body | Use the raw bytes; confirm secret matches the environment |
| 401 only on retries | Replay protection — your endpoint returned non-2xx, the same event re-arrives within the dedupe window | Return 2xx and dedupe by `id` on your side |
| Endpoint times out, all deliveries DLQ'd | Synchronous work takes > 10 s | Queue work; respond 200 immediately |
| Signature header missing | Reverse proxy stripping `X-*` headers | Allowlist the headers in your proxy config |
| Events out of order | Retries can interleave with new events | Use `data.updatedAt` to ignore stale updates |
