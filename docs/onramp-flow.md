# On-Ramp Integration Guide

This guide covers the on-ramp (fiat in → stablecoin out) flow, which mirrors the off-ramp architecture but in reverse.

---

## 1. Architecture Overview

The on-ramp system mirrors the off-ramp's layered architecture:

```
┌────────────────────────────────────────────────────────────┐
│                   API Routes (src/app/api/onramp)          │
│  /quote  /order  /order/[id]  /webhooks/provider          │
│                    /reconciliation                         │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│                  Service Layer                              │
│        OnrampService (src/lib/services/onramp.service.ts)  │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│               Adapter Layer                                 │
│  DepositProviderAdapter ← MoonpayAdapter                    │
│  OnrampProviderRegistry                                     │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│               External Providers                            │
│         MoonPay / Ramp / Transak                            │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Flow — Sequence Diagram

```
User              API              OnrampService         Provider (MoonPay)    Base→Stellar Bridge
 │                 │                    │                      │                    │
 │  POST /quote    │                    │                      │                    │
 │────────────────►│  getQuote()        │                      │                    │
 │                 │───────────────────►│  getQuote()          │                    │
 │                 │                    │─────────────────────►│                    │
 │                 │                    │◄─────────────────────│                    │
 │                 │  ◄──────────────── │                      │                    │
 │◄────────────────│                    │                      │                    │
 │                 │                    │                      │                    │
 │  POST /order    │                    │                      │                    │
 │ (Idempotency-Key)│                   │                      │                    │
 │────────────────►│  createOrder()     │                      │                    │
 │                 │───────────────────►│  createOrder()       │                    │
 │                 │                    │─────────────────────►│                    │
 │                 │                    │◄───── depositAddress │                    │
 │◄─── depositInfo │                    │                      │                    │
 │                 │                    │                      │                    │
 │  (user sends    │                    │                      │                    │
 │   fiat to       │                    │                      │                    │
 │   depositAddr)  │                    │                      │                    │
 │                 │                    │                      │                    │
 │                 │  Webhook: deposit.confirmed               │                    │
 │                 │◄──────────────────────────────────────────│                    │
 │                 │  handleDepositConfirmed()                  │                    │
 │                 │───────────────────►───────────────────────────────────────────►│
 │                 │                    │   bridgeFromBaseToStellar()              │
 │                 │                    │                      │                    │
 │                 │  Webhook: bridge.completed                                     │
 │                 │◄───────────────────────────────────────────────────────────────│
 │                 │  handleBridgeCompleted()                   │                    │
 │                 │                    │                      │                    │
 │  GET /order/id  │                    │                      │                    │
 │────────────────►│  getOrderStatus()  │                      │                    │
 │◄─── completed   │                    │                      │                    │
```

---

## 3. State Machine

```
draft → quoted → order_created → deposit_pending → deposit_confirmed
                                                      │
                                                      ▼
                                              bridge_pending → bridge_completed
                                                      │
                                                      ▼
                                                  completed
                                                      │
                  Any state ─────────────────────► failed / expired
```

| State               | Description                             |
| ------------------- | --------------------------------------- |
| `draft`             | Initial state before quoting            |
| `quoted`            | Quote generated                         |
| `order_created`     | Order created, deposit address returned |
| `deposit_pending`   | Waiting for user fiat deposit           |
| `deposit_confirmed` | Provider confirmed fiat receipt         |
| `bridge_pending`    | Bridging USDC from Base → Stellar       |
| `bridge_completed`  | USDC arrived on Stellar                 |
| `completed`         | User received USDC on Stellar           |

---

## 4. API Endpoints

### POST /api/onramp/quote

Fetches a fiat → stablecoin quote.

**Request:**

```json
{
  "fiatAmount": "100.00",
  "fiatCurrency": "NGN",
  "destinationToken": "USDC",
  "destinationAddress": "G...",
  "provider": "moonpay"
}
```

**Response:**

```json
{
  "quoteId": "uuid",
  "fiatAmount": "100.00",
  "fiatCurrency": "NGN",
  "destinationAmount": "86.42",
  "destinationToken": "USDC",
  "rate": 0.00065,
  "bridgeFee": "0.43",
  "providerFee": "2.50",
  "totalFee": "2.93",
  "estimatedTime": 180,
  "validUntil": "2026-06-26T...",
  "provider": "moonpay"
}
```

### POST /api/onramp/order

Creates an on-ramp order. Requires `Idempotency-Key` header.

**Request:**

```json
{
  "quoteId": "uuid",
  "fiatAmount": "100.00",
  "fiatCurrency": "NGN",
  "destinationAmount": "86.42",
  "destinationToken": "USDC",
  "destinationAddress": "G...",
  "provider": "moonpay",
  "rate": 0.00065
}
```

**Response (201):**

```json
{
  "orderId": "uuid",
  "status": "order_created",
  "depositAddress": "0x...",
  "depositNetwork": "bank_transfer",
  "depositAmount": "100.00",
  "depositToken": "NGN",
  "destinationAmount": "86.42",
  "destinationToken": "USDC",
  "destinationAddress": "G...",
  "fiatAmount": "100.00",
  "fiatCurrency": "NGN",
  "provider": "moonpay",
  "createdAt": "2026-06-26T...",
  "validUntil": "2026-06-26T...+1h"
}
```

### GET /api/onramp/order/[orderId]

Returns current order status.

**Response:**

```json
{
  "orderId": "uuid",
  "status": "deposit_pending",
  "createdAt": "2026-06-26T...",
  "updatedAt": "2026-06-26T..."
}
```

### POST /api/onramp/webhooks/provider

Receives deposit/bridge confirmation webhooks from providers.

**Headers:**
| Header | Required | Description |
|---|---|---|
| `X-Provider` | ✅ | Provider name (e.g., `moonpay`) |
| `X-Provider-Signature` | ✅ | Provider signature |

### POST /api/onramp/reconciliation

Triggers reconciliation for a pending bridge.

**Request:**

```json
{ "orderId": "uuid" }
```

---

## 5. Reconciliation

The reconciliation endpoint (`POST /api/onramp/reconciliation`) performs:

1. Checks orders stuck in `bridge_pending` state
2. Polls the bridge status via `pollBridgeStatus()`
3. Advances to `completed` or `failed` based on the result
4. Returns the updated order status
