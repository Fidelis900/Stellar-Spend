# Environment Variables Reference

Complete reference for all environment variables used by Stellar-Spend.

## Quick Start

```bash
cp .env.example .env.local
# Fill in the values below, then:
npm run dev
```

The app validates all required variables at startup and throws a descriptive error listing every missing or misconfigured variable before the server accepts any requests.

---

## Required — Server-Only

These variables are available only in server-side code (API routes, server components). They must **never** use the `NEXT_PUBLIC_` prefix.

### `PAYCREST_API_KEY`

|                    |                     |
| ------------------ | ------------------- |
| Required           | Yes                 |
| Exposed to browser | No                  |
| Example            | `pk_live_abc123...` |

API key for authenticating requests to the Paycrest sender API. Used by `PaycrestAdapter` to create payout orders, fetch currencies, list institutions, verify accounts, and get FX rates.

Obtain from the Paycrest dashboard under API credentials.

> **Security:** If this key is leaked, an attacker can create payout orders on your behalf. Rotate immediately via the Paycrest dashboard if exposure is suspected.

---

### `PAYCREST_WEBHOOK_SECRET`

|                    |                   |
| ------------------ | ----------------- |
| Required           | Yes               |
| Exposed to browser | No                |
| Example            | `whsec_xyz789...` |

Signing secret used to verify the HMAC-SHA-256 signature on incoming Paycrest webhook events. The webhook handler at `/api/webhooks/paycrest` rejects any request whose `X-Paycrest-Signature` header does not match.

Obtain from the Paycrest dashboard under webhook settings.

> **Security:** Never log or expose this value. An attacker with this secret can forge webhook events and manipulate order status.

---

### `BASE_PRIVATE_KEY`

|                    |                          |
| ------------------ | ------------------------ |
| Required           | Yes                      |
| Exposed to browser | No                       |
| Format             | `0x` + 64 hex characters |
| Example            | `0xabc123...`            |

Private key for the Base wallet that signs and submits USDC transfer transactions to Paycrest deposit addresses. Used exclusively by the server-side payout execution logic.

> **Security:** This is the most sensitive variable in the application. Store it in your hosting provider's secret store (e.g., Vercel Environment Variables, AWS Secrets Manager). The wallet should hold only the minimum USDC balance needed for operations — do not use it as a treasury wallet. Rotate immediately if exposure is suspected.

---

### `BASE_RETURN_ADDRESS`

|                    |                                              |
| ------------------ | -------------------------------------------- |
| Required           | Yes                                          |
| Exposed to browser | No                                           |
| Format             | EVM address (`0x` + 40 hex characters)       |
| Example            | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` |

The Base wallet address where Paycrest returns funds if a payout order cannot be completed (e.g., expired or refunded). Also used as the `returnAddress` field when creating Paycrest orders.

---

### `BASE_RPC_URL`

|                           |                            |
| ------------------------- | -------------------------- |
| Required                  | Yes                        |
| Exposed to browser        | No                         |
| Default in `.env.example` | `https://mainnet.base.org` |

Base mainnet RPC endpoint used by the server for on-chain USDC transfer execution via `viem`. Can be the public Base RPC or a provider URL from Alchemy, Infura, QuickNode, etc.

> **Note:** The public `https://mainnet.base.org` endpoint has rate limits. Use a dedicated provider URL in production for reliability.

---

### `STELLAR_SOROBAN_RPC_URL`

|                           |                                                  |
| ------------------------- | ------------------------------------------------ |
| Required                  | Yes                                              |
| Exposed to browser        | No                                               |
| Default in `.env.example` | `https://soroban-rpc.mainnet.stellar.gateway.fm` |

Soroban RPC endpoint used server-side for building and submitting Stellar bridge transactions. Mapped to the `SRB` key in the Allbridge SDK's RPC URL config.

---

### `STELLAR_HORIZON_URL`

|                           |                               |
| ------------------------- | ----------------------------- |
| Required                  | Yes                           |
| Exposed to browser        | No                            |
| Default in `.env.example` | `https://horizon.stellar.org` |

Stellar Horizon API endpoint used server-side for account lookups and trustline queries. Mapped to the `STLR` key in the Allbridge SDK's RPC URL config.

---

## Required — Public (Browser-Safe)

These variables are bundled into the client-side JavaScript. They must use the `NEXT_PUBLIC_` prefix and must not contain secrets.

### `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL`

|                           |                                                  |
| ------------------------- | ------------------------------------------------ |
| Required                  | Yes                                              |
| Exposed to browser        | Yes                                              |
| Default in `.env.example` | `https://soroban-rpc.mainnet.stellar.gateway.fm` |

Browser-safe Soroban RPC endpoint used for client-side Stellar interactions (e.g., wallet connection, transaction simulation). Can be the same value as `STELLAR_SOROBAN_RPC_URL` if the endpoint is publicly accessible.

---

### `NEXT_PUBLIC_BASE_RETURN_ADDRESS`

|                    |                                        |
| ------------------ | -------------------------------------- |
| Required           | Yes                                    |
| Exposed to browser | Yes                                    |
| Format             | EVM address (`0x` + 40 hex characters) |

Browser-safe version of the Base return address. Exposed to the client so the UI can display or use the return address without a server round-trip. Safe to expose because it is a wallet address, not a private key.

Must match `BASE_RETURN_ADDRESS`.

---

### `NEXT_PUBLIC_STELLAR_USDC_ISSUER`

|                    |                                                            |
| ------------------ | ---------------------------------------------------------- |
| Required           | Yes                                                        |
| Exposed to browser | Yes                                                        |
| Format             | Stellar account ID (`G` + 55 characters)                   |
| Mainnet value      | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |

The Stellar account ID of the USDC issuer (Circle). Used client-side to filter the correct USDC trustline from Horizon when reading wallet balances.

Obtain the current mainnet value from the [Circle documentation](https://developers.circle.com/stablecoins/docs/usdc-on-stellar) or the [Stellar asset directory](https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN).

---

## Optional

These variables are not required for the app to start. Omitting them disables the associated feature.

### `SENTRY_DSN`

|                    |              |
| ------------------ | ------------ |
| Required           | No           |
| Exposed to browser | No           |
| Default            | _(disabled)_ |

Sentry DSN for server-side error monitoring. When set, unhandled server errors are reported to your Sentry project. Obtain from Sentry project settings → Client Keys.

---

### `NEXT_PUBLIC_SENTRY_DSN`

|                    |              |
| ------------------ | ------------ |
| Required           | No           |
| Exposed to browser | Yes          |
| Default            | _(disabled)_ |

Sentry DSN for browser-side error monitoring. Can be the same value as `SENTRY_DSN`. When set, client-side errors are reported to Sentry.

---

### `SENTRY_ORG`

|                    |                                      |
| ------------------ | ------------------------------------ |
| Required           | No (required for source map uploads) |
| Exposed to browser | No                                   |
| Example            | `my-org-slug`                        |

Sentry organization slug. Used by the Sentry webpack plugin during `npm run build` to associate source maps with the correct organization.

---

### `SENTRY_PROJECT`

|                    |                                      |
| ------------------ | ------------------------------------ |
| Required           | No (required for source map uploads) |
| Exposed to browser | No                                   |
| Example            | `stellar-spend`                      |

Sentry project slug. Used alongside `SENTRY_ORG` for source map uploads during CI builds.

---

### `SENTRY_AUTH_TOKEN`

|          |                                      |
| -------- | ------------------------------------ |
| Required | No (required for source map uploads) |

---

### `EMAIL_NOTIFICATION_ENDPOINT`

|                    |              |
| ------------------ | ------------ |
| Required           | No           |
| Exposed to browser | No           |
| Default            | _(disabled)_ |

HTTP endpoint used by the transaction notification service to send email notifications for transaction status changes. The service sends JSON with `from`, `to`, `subject`, and `text`.

---

### `EMAIL_NOTIFICATION_AUTH_TOKEN`

|                    |           |
| ------------------ | --------- |
| Required           | No        |
| Exposed to browser | No        |
| Default            | _(unset)_ |

Optional bearer token attached to requests sent to `EMAIL_NOTIFICATION_ENDPOINT`.

---

### `EMAIL_NOTIFICATION_FROM`

|                           |                               |
| ------------------------- | ----------------------------- |
| Required                  | No                            |
| Exposed to browser        | No                            |
| Default in `.env.example` | `noreply@stellar-spend.local` |

Default sender address used in outbound email notifications.

---

### `SMS_NOTIFICATION_ENABLED`

|                           |         |
| ------------------------- | ------- |
| Required                  | No      |
| Exposed to browser        | No      |
| Default in `.env.example` | `false` |

Enables optional SMS delivery for transaction notifications. SMS deliveries are skipped unless this is set to `true` and `SMS_NOTIFICATION_ENDPOINT` is configured.

---

### `SMS_NOTIFICATION_ENDPOINT`

|                    |              |
| ------------------ | ------------ |
| Required           | No           |
| Exposed to browser | No           |
| Default            | _(disabled)_ |

HTTP endpoint used by the transaction notification service to send SMS payloads with `to` and `message`.

---

### `SMS_NOTIFICATION_AUTH_TOKEN`

|                    |           |
| ------------------ | --------- |
| Required           | No        |
| Exposed to browser | No        |
| Default            | _(unset)_ |

Optional bearer token attached to requests sent to `SMS_NOTIFICATION_ENDPOINT`.

---

### `API_KEY_ADMIN_TOKEN`

|                    |              |
| ------------------ | ------------ |
| Required           | No           |
| Exposed to browser | No           |
| Default            | _(disabled)_ |

Bearer token used to authorize API key management endpoints under `/api/api-keys`. When unset, key management routes are effectively disabled.
| Exposed to browser | No |

Sentry auth token used by the webpack plugin to authenticate source map uploads. Generate at [sentry.io/settings/account/api/auth-tokens](https://sentry.io/settings/account/api/auth-tokens/).

> **Security:** Treat this like a password. Store it as a CI secret, not in `.env.local`.

---

### `ANALYZE`

|                    |                 |
| ------------------ | --------------- |
| Required           | No              |
| Exposed to browser | No              |
| Default            | `false`         |
| Valid values       | `true`, `false` |

When set to `true`, running `npm run build:analyze` opens an interactive bundle treemap. Used locally to inspect chunk sizes. Has no effect at runtime.

---

### `ALLOWED_ORIGINS`

|                    |                                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| Required           | No                                                                        |
| Exposed to browser | No                                                                        |
| Default            | `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3002` |
| Format             | Comma-separated list of origins                                           |
| Example            | `https://your-app.vercel.app,https://www.your-domain.com`                 |

Controls which origins are permitted to call the API from a browser (CORS). When left empty, the development localhost origins are allowed. In production, set this to your actual frontend origin(s).

---

## Validation

`src/lib/env.ts` runs `validateEnv()` at module load time (i.e., on every cold start). It checks three conditions:

1. All required server variables are present and non-empty.
2. All required public variables are present and non-empty.
3. Neither `NEXT_PUBLIC_PAYCREST_API_KEY` nor `NEXT_PUBLIC_BASE_PRIVATE_KEY` is set (secret exposure guard).

If any check fails, the server throws with a message listing every offending variable:

```
Invalid environment configuration for Stellar-Spend.
Create or update .env.local using .env.example before starting the server.

Missing required server env vars: BASE_PRIVATE_KEY, BASE_RPC_URL
Remove secret values from public env vars: NEXT_PUBLIC_PAYCREST_API_KEY
PAYCREST_API_KEY and BASE_PRIVATE_KEY must never use the NEXT_PUBLIC_ prefix.
```

### Accessing Variables in Code

Always import from `@/lib/env` rather than reading `process.env` directly:

```ts
import { env } from '@/lib/env';

// Server-side
const apiKey = env.server.PAYCREST_API_KEY;

// Client-safe
const issuer = env.public.NEXT_PUBLIC_STELLAR_USDC_ISSUER;
```

This ensures TypeScript catches missing accesses at compile time and keeps all validation in one place.

---

## Security Notes

- `.env.local` is listed in `.gitignore` — never commit it.
- In production, inject secrets via your hosting provider's environment/secret management, not via committed files.
- The `NEXT_PUBLIC_` prefix bundles a variable into the client JavaScript. Any value with this prefix is visible to anyone who inspects the page source or network traffic.
- `PAYCREST_API_KEY`, `PAYCREST_WEBHOOK_SECRET`, and `BASE_PRIVATE_KEY` must never receive the `NEXT_PUBLIC_` prefix. The app enforces this at startup.
