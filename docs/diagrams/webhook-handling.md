# Sequence Diagram: Webhook Handling (Paycrest Events)

This diagram shows how Paycrest payment event webhooks are received, verified,
and processed by Stellar-Spend.

```mermaid
sequenceDiagram
    autonumber
    participant Paycrest as Paycrest<br/>API
    participant WebhookRoute as POST /api/webhooks/<br/>paycrest
    participant HMAC as HMAC-SHA256<br/>Verifier
    participant EventBus as Internal<br/>Event Bus
    participant DB as PostgreSQL<br/>Database
    participant Notifier as Notification<br/>Service

    Paycrest->>WebhookRoute: POST {event, data}<br/>X-Paycrest-Signature: <hmac-hex>

    WebhookRoute->>WebhookRoute: request.text()<br/>(read raw body — do NOT parse JSON first)

    WebhookRoute->>HMAC: verifySignature(<br/>  rawBody,<br/>  X-Paycrest-Signature,<br/>  PAYCREST_WEBHOOK_SECRET<br/>)
    Note over HMAC: HMAC-SHA256(rawBody, secret)<br/>compared with constant-time XOR<br/>to prevent timing attacks

    alt Signature invalid or missing
        HMAC-->>WebhookRoute: false
        WebhookRoute-->>Paycrest: 401 {error: "Invalid signature"}
        Note over Paycrest: Paycrest will retry on non-2xx
    else Signature valid
        HMAC-->>WebhookRoute: true

        WebhookRoute->>WebhookRoute: JSON.parse(rawBody)

        alt JSON parse fails
            WebhookRoute-->>Paycrest: 400 {error: "Malformed payload"}
        else JSON parsed successfully
            WebhookRoute->>WebhookRoute: mapPaycrestStatus(event)<br/>"payment_order.settled" → "settled"

            WebhookRoute->>DB: upsert transaction status<br/>(orderId, status, timestamp)
            DB-->>WebhookRoute: ok

            WebhookRoute->>EventBus: emit("order.status_changed", {orderId, status})
            EventBus-->>WebhookRoute: async (fire-and-forget)

            WebhookRoute-->>Paycrest: 200 {received: true}

            EventBus->>Notifier: handle order.status_changed
            Notifier->>DB: fetch notification preferences<br/>(userAddress)
            DB-->>Notifier: preferences

            alt emailEnabled && notifyOnCompleted
                Notifier->>Notifier: POST EMAIL_NOTIFICATION_ENDPOINT<br/>{from, to, subject, text}
            end

            alt smsEnabled && notifyOnCompleted
                Notifier->>Notifier: POST SMS_NOTIFICATION_ENDPOINT<br/>{to, message}
            end
        end
    end
```

## Event → Internal Status Mapping

| Webhook Event             | Internal `PayoutStatus` | Terminal? |
| ------------------------- | ----------------------- | --------- |
| `payment_order.pending`   | `pending`               | No        |
| `payment_order.validated` | `validated`             | No        |
| `payment_order.settled`   | `settled`               | ✅ Yes    |
| `payment_order.refunded`  | `refunded`              | ✅ Yes    |
| `payment_order.expired`   | `expired`               | ✅ Yes    |

Unknown events default to `pending`.

## Retry Behaviour

Paycrest retries webhook delivery on non-`2xx` responses. The handler always returns `200 {received: true}` after successful signature verification, even if the downstream event handling fails asynchronously. This prevents Paycrest from retrying for errors the app cannot recover from.

## Webhook Registration

In the Paycrest dashboard, set the webhook URL to:

```
https://<your-domain>/api/webhooks/paycrest
```

Both `/api/webhooks/paycrest` (legacy) and `/api/v1/webhooks/paycrest` (versioned) accept events.

## Security Notes

- The raw request body is read **before** any JSON parsing. Parsing can change byte sequences (e.g., whitespace normalisation) which would invalidate the HMAC comparison.
- Signature comparison uses a constant-time XOR loop — not `===` — to prevent timing side-channel attacks.
- `PAYCREST_WEBHOOK_SECRET` must never be prefixed with `NEXT_PUBLIC_` — it is validated by `src/lib/env.ts` at startup.
