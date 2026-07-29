# Error Codes & Troubleshooting Guide

This document provides a comprehensive reference for all error codes used in Stellar-Spend, including user-facing messages, technical details, common causes, and resolution steps.

---

## Table of Contents

- [Error Code Structure](#error-code-structure)
- [Validation Errors (4000–4009)](#validation-errors-40004009)
- [Authentication Errors (4010–4019)](#authentication-errors-40104019)
- [Business Logic Errors (4020–4099)](#business-logic-errors-40204099)
- [Server Errors (5000–5099)](#server-errors-50005099)
- [Stellar-Specific Errors](#stellar-specific-errors)
- [Allbridge Bridge Errors](#allbridge-bridge-errors)
- [Paycrest API Errors](#paycrest-api-errors)
- [Error Response Format](#error-response-format)
- [HTTP Status Code Mapping](#http-status-code-mapping)

---

## Error Code Structure

All error codes follow the pattern `ERR_XYYY` where:

- **X** — first digit of the category (4 = client error, 5 = server error)
- **YYY** — specific sub-code within the category

Error codes are defined in [`src/lib/middleware/error-codes.ts`](../src/lib/middleware/error-codes.ts) and classified into types in [`src/lib/error-types.ts`](../src/lib/error-types.ts).

---

## Validation Errors (4000–4009)

These errors indicate malformed or missing input data sent by the client. All validation errors return HTTP **400 Bad Request**.

### `ERR_4001` — Invalid Input

| Field            | Value                    |
| ---------------- | ------------------------ |
| **Code**         | `ERR_4001`               |
| **HTTP Status**  | 400                      |
| **Error Type**   | `validation_error`       |
| **User Message** | "Invalid input provided" |

**Common Causes:**

- Request body contains fields of the wrong type (e.g., string where number is expected)
- Malformed JSON in the request body
- Out-of-range values for numeric fields

**Resolution Steps:**

1. Review the API documentation for the endpoint being called
2. Ensure all field types match the expected schema
3. Validate JSON structure before sending

**Example Response:**

```json
{
  "error": "validation_error",
  "message": "Invalid input provided"
}
```

---

### `ERR_4002` — Missing Required Field

| Field            | Value                    |
| ---------------- | ------------------------ |
| **Code**         | `ERR_4002`               |
| **HTTP Status**  | 400                      |
| **Error Type**   | `validation_error`       |
| **User Message** | "Missing required field" |

**Common Causes:**

- A required field is omitted from the request body
- A required query parameter is not included

**Resolution Steps:**

1. Check the endpoint's required parameters in the API docs
2. Ensure all required fields are present and non-null

**Example Response:**

```json
{
  "error": "validation_error",
  "message": "Validation failed for field: amount"
}
```

---

### `ERR_4003` — Invalid Amount

| Field            | Value              |
| ---------------- | ------------------ |
| **Code**         | `ERR_4003`         |
| **HTTP Status**  | 400                |
| **Error Type**   | `validation_error` |
| **User Message** | "Invalid amount"   |

**Common Causes:**

- Amount is zero or negative
- Amount exceeds the maximum allowed transaction limit
- Amount has too many decimal places for the selected currency

**Resolution Steps:**

1. Ensure the amount is a positive number
2. Check the KYC tier limits for the user's account
3. Verify the amount format matches the currency's precision requirements

---

### `ERR_4004` — Invalid Currency

| Field            | Value              |
| ---------------- | ------------------ |
| **Code**         | `ERR_4004`         |
| **HTTP Status**  | 400                |
| **Error Type**   | `validation_error` |
| **User Message** | "Invalid currency" |

**Common Causes:**

- Currency code is not in the list of supported currencies
- Typo in the currency code (e.g., `USDC` vs `usd`)
- Currency is not available for the selected corridor

**Resolution Steps:**

1. Query `GET /api/currencies` for the list of supported currencies
2. Verify the currency code matches exactly (case-sensitive)
3. Confirm the currency supports the desired payment corridor

---

## Authentication Errors (4010–4019)

These errors indicate problems with API key or session authentication. They return HTTP **401 Unauthorized**.

### `ERR_4010` — Unauthorized

| Field            | Value                 |
| ---------------- | --------------------- |
| **Code**         | `ERR_4010`            |
| **HTTP Status**  | 401                   |
| **Error Type**   | `unauthorized`        |
| **User Message** | "Unauthorized access" |

**Common Causes:**

- Missing `Authorization` header or `X-API-Key` header
- Session token has expired (sessions expire after 30 minutes of inactivity)
- Request made to an authenticated endpoint without a valid session

**Resolution Steps:**

1. Include a valid session token in the `Authorization: Bearer <token>` header
2. Refresh the session using the refresh token endpoint if the session has expired
3. Re-authenticate to obtain a new session

---

### `ERR_4011` — Invalid API Key

| Field            | Value             |
| ---------------- | ----------------- |
| **Code**         | `ERR_4011`        |
| **HTTP Status**  | 401               |
| **Error Type**   | `unauthorized`    |
| **User Message** | "Invalid API key" |

**Common Causes:**

- API key has been revoked or rotated
- API key prefix/hash mismatch
- Using a key intended for a different environment (e.g., sandbox key in production)

**Resolution Steps:**

1. Verify the API key is active via the admin API key management endpoint
2. Rotate the API key if it may have been compromised (see [Security Best Practices](./security-best-practices.md))
3. Ensure you are using the correct API key for the target environment

---

## Business Logic Errors (4020–4099)

These errors occur when a request is well-formed but cannot be completed due to business rules. They return HTTP **400 Bad Request** unless noted otherwise.

### `ERR_4020` — Insufficient Balance

| Field            | Value                  |
| ---------------- | ---------------------- |
| **Code**         | `ERR_4020`             |
| **HTTP Status**  | 400                    |
| **Error Type**   | `validation_error`     |
| **User Message** | "Insufficient balance" |

**Common Causes:**

- Wallet does not hold enough USDC or the selected stablecoin to cover the transaction amount plus fees
- XLM balance is below the minimum reserve required by the Stellar network (1 XLM base reserve + 0.5 XLM per trustline)
- Fee estimation changed between quote and submission

**Resolution Steps:**

1. Check the wallet balance via the Stellar Horizon API
2. Ensure at least 1 XLM + (0.5 × number of trustlines) XLM is maintained as reserve
3. Top up the wallet and retry the transaction

---

### `ERR_4021` — Transaction Failed

| Field            | Value                |
| ---------------- | -------------------- |
| **Code**         | `ERR_4021`           |
| **HTTP Status**  | 400                  |
| **Error Type**   | `validation_error`   |
| **User Message** | "Transaction failed" |

**Common Causes:**

- The Stellar transaction was submitted but rejected by the network
- Sequence number mismatch (account state changed between build and submission)
- Transaction expired before network submission (Stellar transactions have a time bound)

**Resolution Steps:**

1. Check the `stellar_tx_hash` field on the transaction record for on-chain details via Stellar Explorer
2. Rebuild the transaction with a fresh sequence number
3. Retry with a shorter time bound window

---

### `ERR_4022` — Bridge Unavailable

| Field            | Value                        |
| ---------------- | ---------------------------- |
| **Code**         | `ERR_4022`                   |
| **HTTP Status**  | 502                          |
| **Error Type**   | `external_service_error`     |
| **User Message** | "Bridge service unavailable" |

**Common Causes:**

- Allbridge Core is experiencing downtime or maintenance
- Network connectivity issue between Stellar-Spend servers and the bridge
- Bridge pool liquidity is exhausted for the requested corridor

**Resolution Steps:**

1. Check the [Allbridge status page](https://allbridge.io) for ongoing incidents
2. Retry the request after a short delay (exponential backoff recommended)
3. If the issue persists, contact Allbridge support with the `bridge_status` field from the transaction record

---

### `ERR_4023` — Payout Failed

| Field            | Value              |
| ---------------- | ------------------ |
| **Code**         | `ERR_4023`         |
| **HTTP Status**  | 400                |
| **Error Type**   | `validation_error` |
| **User Message** | "Payout failed"    |

**Common Causes:**

- Paycrest rejected the payout order (invalid beneficiary account, bank validation failure)
- The payout order expired before funds arrived
- The beneficiary institution is temporarily unavailable

**Resolution Steps:**

1. Verify beneficiary account details (account number, bank code, account name)
2. Use `GET /api/paycrest/institutions/:currency` to confirm the institution code is valid
3. Check the `payout_status` and `error` fields on the transaction record for specific Paycrest error details

---

## Server Errors (5000–5099)

These errors indicate internal problems within the Stellar-Spend application. They return HTTP **500** or **502**. Users should be advised to retry; operators should investigate logs.

### `ERR_5000` — Internal Error

| Field            | Value                   |
| ---------------- | ----------------------- |
| **Code**         | `ERR_5000`              |
| **HTTP Status**  | 500                     |
| **Error Type**   | `server_error`          |
| **User Message** | "Internal server error" |

**Common Causes:**

- Unhandled exception in an API route handler
- Unexpected data shape from a database query
- Configuration error at startup

**Resolution Steps (Operators):**

1. Check application logs in CloudWatch or your configured log drain
2. Review the Sentry dashboard for the captured exception and stack trace
3. Verify environment variables are correctly set (see [Environment Variables](./environment-variables.md))

---

### `ERR_5001` — Database Error

| Field            | Value            |
| ---------------- | ---------------- |
| **Code**         | `ERR_5001`       |
| **HTTP Status**  | 500              |
| **Error Type**   | `server_error`   |
| **User Message** | "Database error" |

**Common Causes:**

- PostgreSQL connection pool exhausted
- Query timeout exceeded
- Database migration not applied (schema mismatch)

**Resolution Steps (Operators):**

1. Check `DATABASE_URL` is correctly configured
2. Verify the database server is reachable from the application
3. Ensure all migrations in `migrations/` have been applied in order
4. Monitor connection pool metrics and increase `max` connections if needed

---

### `ERR_5002` — External Service Error

| Field            | Value                    |
| ---------------- | ------------------------ |
| **Code**         | `ERR_5002`               |
| **HTTP Status**  | 502                      |
| **Error Type**   | `external_service_error` |
| **User Message** | "External service error" |

**Common Causes:**

- Paycrest API returned an unexpected response
- Allbridge Core SDK threw an uncaught error
- Stellar Horizon or Soroban RPC returned a 5xx response

**Resolution Steps:**

1. Check the external service's status page
2. Review the `error` field on the transaction record for the raw error from the external service
3. Retry with exponential backoff; most external service errors are transient

---

### `ERR_5003` — Timeout

| Field            | Value             |
| ---------------- | ----------------- |
| **Code**         | `ERR_5003`        |
| **HTTP Status**  | 504               |
| **Error Type**   | `server_error`    |
| **User Message** | "Request timeout" |

**Common Causes:**

- Paycrest API call exceeded the 15-second timeout
- Stellar Horizon query took too long (network congestion)
- Database query exceeded the configured statement timeout

**Resolution Steps:**

1. Retry the request; timeouts are usually transient
2. Check if the underlying service is under heavy load
3. For operators: review the `apiP95WarnMs` and `apiP95CriticalMs` thresholds in `src/lib/performance.ts`

---

## Stellar-Specific Errors

These errors arise from interactions with the Stellar network and are surfaced through the transaction `error` field or the `ERR_4020` / `ERR_4021` codes.

### Insufficient XLM Reserve

**Symptom:** Transaction submission rejected with `op_underfunded` or similar.

**Technical Details:**

- Stellar requires every account to maintain a minimum balance: **1 XLM base reserve + 0.5 XLM per trustline/offer**.
- USDC trustline requires 0.5 XLM, so the effective minimum for a typical Stellar-Spend user is **1.5 XLM**.

**Resolution:**

1. Ensure the user's Stellar account holds at least 1.5 XLM
2. Surface the reserve requirement in the UI before initiating a transaction
3. Use `GET /api/stellar/account/:address` to check the account's available balance

---

### Trustline Not Established

**Symptom:** `op_no_trust` error when attempting to receive or send a non-native asset.

**Technical Details:**

- A Stellar account must explicitly create a trustline before receiving a non-native asset (e.g., USDC).
- Creating a trustline costs 0.5 XLM of reserve.

**Resolution:**

1. Before sending USDC, verify the destination account has an active trustline for the asset
2. Use the Stellar SDK to create the trustline: `changeTrust` operation with the asset and a sufficient limit
3. Check for trustlines via the Horizon `/accounts/:id` endpoint

---

### Sequence Number Mismatch

**Symptom:** `tx_bad_seq` error from Stellar Horizon.

**Technical Details:**

- Stellar transactions include the sender's current sequence number. If the account state changes between transaction build and submission, the sequence number is stale.

**Resolution:**

1. Fetch the latest account sequence number immediately before building the transaction
2. Do not cache sequence numbers across requests
3. Re-sign the transaction with the updated sequence number and resubmit

---

## Allbridge Bridge Errors

Bridge errors are wrapped in `ERR_4022` (Bridge Unavailable) or `ERR_5002` (External Service Error) depending on whether the issue is transient.

| Scenario                     | Surfaced As | Description                                               |
| ---------------------------- | ----------- | --------------------------------------------------------- |
| Bridge pool has no liquidity | `ERR_4022`  | The bridge pool for the requested token pair is exhausted |
| Bridge API timeout           | `ERR_5003`  | Bridge SDK call exceeded the timeout threshold            |
| Invalid transfer parameters  | `ERR_4001`  | Amount or token address rejected by the bridge            |
| Bridge maintenance           | `ERR_4022`  | Allbridge is undergoing scheduled maintenance             |

**Debugging Bridge Errors:**

1. Check `bridge_status` on the transaction record — it mirrors the bridge's reported status
2. Poll `usePollBridgeStatus` hook output to follow a live bridge transfer
3. If a bridge transfer is stuck, contact Allbridge support with the `stellar_tx_hash`

---

## Paycrest API Errors

Paycrest errors are captured as `PaycrestHttpError` instances and preserve the original HTTP status from the Paycrest API. Common Paycrest error scenarios:

| Paycrest Status | Stellar-Spend Behaviour           | Meaning                                                         |
| --------------- | --------------------------------- | --------------------------------------------------------------- |
| 400             | Returns 400 with Paycrest message | Invalid order parameters (bad account, unsupported institution) |
| 401             | Returns 401                       | `PAYCREST_API_KEY` is invalid or expired                        |
| 404             | Returns 404                       | Order ID not found (querying a non-existent order)              |
| 429             | Returns 429                       | Rate limit exceeded — back off and retry                        |
| 500             | Returns 502                       | Paycrest internal error — usually transient                     |
| 504             | Returns 504 (`ERR_5003`)          | Paycrest API timeout (15 s threshold)                           |

**Paycrest Webhook Errors:**

- If webhook signature verification fails, the webhook endpoint returns `400 Bad Request` and logs the event.
- Ensure `PAYCREST_WEBHOOK_SECRET` is current and matches the secret configured in the Paycrest dashboard.
- See [Security Best Practices](./security-best-practices.md) for webhook signature verification details.

---

## Error Response Format

All API error responses follow this standard structure:

```json
{
  "error": "<error_type>",
  "message": "<human-readable description>",
  "details": "<additional context — development only>"
}
```

| Field     | Type   | Always Present      | Description                                            |
| --------- | ------ | ------------------- | ------------------------------------------------------ |
| `error`   | string | ✅                  | Machine-readable error type (e.g., `validation_error`) |
| `message` | string | ✅                  | Human-readable description of the error                |
| `details` | object | ❌ Development only | Stack trace or extra context (never in production)     |

**Sensitive data is automatically redacted from all error responses:**

- File paths → `[file]`
- Database connection strings → `[connection_string]`
- API keys (32+ char tokens) → `[api_key]`
- Fields named `password`, `token`, `secret`, `key`, `auth`, `credential` → `[redacted]`

---

## HTTP Status Code Mapping

| HTTP Status | Error Type               | Typical Error Codes                                                                |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------- |
| 400         | `validation_error`       | `ERR_4001`, `ERR_4002`, `ERR_4003`, `ERR_4004`, `ERR_4020`, `ERR_4021`, `ERR_4023` |
| 401         | `unauthorized`           | `ERR_4010`, `ERR_4011`                                                             |
| 403         | `forbidden`              | Session active but insufficient permissions                                        |
| 404         | `not_found`              | Resource does not exist                                                            |
| 500         | `server_error`           | `ERR_5000`, `ERR_5001`                                                             |
| 502         | `external_service_error` | `ERR_4022`, `ERR_5002`                                                             |
| 504         | `server_error`           | `ERR_5003`                                                                         |

---

## Related Documentation

- [API Reference](./api.md)
- [Security Best Practices](./security-best-practices.md)
- [Paycrest Integration Guide](./paycrest-integration.md)
- [Monitoring & Observability](./monitoring.md)
