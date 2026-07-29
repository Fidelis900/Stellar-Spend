# API Migration Guide: Unversioned → v1

This guide covers the changes introduced by API versioning and how to update your integration.

## Route Changes

All routes now have a `/api/v1/` prefix. Unversioned routes continue to work during the transition period but are deprecated.

| Legacy Route                                | Versioned Route                                |
| ------------------------------------------- | ---------------------------------------------- |
| `GET /api/health`                           | `GET /api/v1/health`                           |
| `GET /api/fx-rates`                         | `GET /api/v1/fx-rates`                         |
| `POST /api/offramp/quote`                   | `POST /api/v1/offramp/quote`                   |
| `GET /api/offramp/rate`                     | `GET /api/v1/offramp/rate`                     |
| `GET /api/offramp/currencies`               | `GET /api/v1/offramp/currencies`               |
| `GET /api/offramp/verify-account`           | `GET /api/v1/offramp/verify-account`           |
| `GET /api/offramp/institutions/[currency]`  | `GET /api/v1/offramp/institutions/[currency]`  |
| `GET /api/offramp/status/[orderId]`         | `GET /api/v1/offramp/status/[orderId]`         |
| `POST /api/offramp/paycrest/order`          | `POST /api/v1/offramp/paycrest/order`          |
| `GET /api/offramp/paycrest/order/[orderId]` | `GET /api/v1/offramp/paycrest/order/[orderId]` |
| `POST /api/offramp/bridge/build-tx`         | `POST /api/v1/offramp/bridge/build-tx`         |
| `GET /api/offramp/bridge/gas-fee-options`   | `GET /api/v1/offramp/bridge/gas-fee-options`   |
| `GET /api/offramp/bridge/status/[txHash]`   | `GET /api/v1/offramp/bridge/status/[txHash]`   |
| `GET /api/offramp/bridge/tx-status/[hash]`  | `GET /api/v1/offramp/bridge/tx-status/[hash]`  |
| `POST /api/offramp/bridge/submit-soroban`   | `POST /api/v1/offramp/bridge/submit-soroban`   |
| `POST /api/webhooks/paycrest`               | `POST /api/v1/webhooks/paycrest`               |

## Version Negotiation

Three ways to specify the API version:

**1. URL prefix (recommended)**

```
GET /api/v1/offramp/quote
```

**2. X-API-Version header**

```
GET /api/offramp/quote
X-API-Version: 1
```

**3. Accept header**

```
GET /api/offramp/quote
Accept: application/vnd.stellarspend.v1+json
```

URL prefix takes precedence over headers. Unversioned requests without headers default to v1.

## Deprecation Timeline

Legacy unversioned routes (`/api/*`) are deprecated as of **2025-01-01** and will be removed on **2026-01-01**.

Deprecated routes return these response headers:

```
Deprecation: 2025-01-01
Sunset: 2026-01-01
Link: </api/v1/{path}>; rel="successor-version"
```

## Code Examples

**Before:**

```typescript
const res = await fetch('/api/offramp/quote', {
  method: 'POST',
  body: JSON.stringify({ amount, currency, feeMethod }),
});
```

**After:**

```typescript
const res = await fetch('/api/v1/offramp/quote', {
  method: 'POST',
  body: JSON.stringify({ amount, currency, feeMethod }),
});
```

**Or using the header approach (no URL change needed):**

```typescript
const res = await fetch('/api/offramp/quote', {
  method: 'POST',
  headers: { 'X-API-Version': '1' },
  body: JSON.stringify({ amount, currency, feeMethod }),
});
```

## Version Discovery

Query available versions programmatically:

```
GET /api/versions
```

Response:

```json
{
  "versions": [
    {
      "version": "v1",
      "status": "supported",
      "prefix": "/api/v1"
    }
  ]
}
```
