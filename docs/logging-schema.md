# Logging Schema

All application logs are emitted as NDJSON to stdout and ingested by CloudWatch Logs via the ECS log driver. Logs are shipped to S3 via Kinesis Firehose for long-term archival.

## Log Entry Fields

| Field           | Type                       | Always Present | Description                                                      |
| --------------- | -------------------------- | -------------- | ---------------------------------------------------------------- |
| `level`         | `debug\|info\|warn\|error` | ✅             | Log severity                                                     |
| `event`         | `string`                   | ✅             | Dot-namespaced event name (e.g. `http.request`, `payout.failed`) |
| `timestamp`     | ISO 8601                   | ✅             | UTC time of the log entry                                        |
| `service`       | `string`                   | ✅             | Always `stellar-spend`                                           |
| `environment`   | `string`                   | ✅             | `production`, `staging`, `development`                           |
| `requestId`     | `string`                   | When available | Correlation ID propagated via `X-Request-Id` header              |
| `error.message` | `string`                   | On errors      | Error message                                                    |
| `error.name`    | `string`                   | On errors      | Error class name                                                 |
| `error.stack`   | `string`                   | On errors      | Stack trace (non-production only)                                |

## HTTP Request Events

Every API request emits an `http.request` event with these additional fields:

| Field        | Type     | Description                      |
| ------------ | -------- | -------------------------------- |
| `method`     | `string` | HTTP method (`GET`, `POST`, …)   |
| `path`       | `string` | URL pathname                     |
| `status`     | `number` | HTTP response status code        |
| `durationMs` | `number` | Request duration in milliseconds |

## Correlation ID Flow

1. Client sends (or the middleware generates) an `X-Request-Id` header.
2. All log entries within that request lifecycle include `requestId`.
3. The middleware echoes `X-Request-Id` back in the response header.

Use the `trace-by-request-id` CloudWatch Insights saved query to retrieve the full trace for a given `requestId`.

## PII Redaction

The logger automatically redacts:

- **Secret keys** — any field named `privateKey`, `apiKey`, `secret`, `password`, `token`, `authorization`, `x-api-key`, `database_url` → `[REDACTED]`
- **Email addresses** in string values → `[EMAIL]`
- **Phone numbers** in string values → `[PHONE]`
- **Bank account numbers** (8–18 digit sequences) in string values → `[ACCOUNT]`

## Retention Policy

| Storage                      | Retention   |
| ---------------------------- | ----------- |
| CloudWatch Logs (staging)    | 30 days     |
| CloudWatch Logs (production) | 90 days     |
| S3 (hot)                     | 90 days     |
| S3 (Glacier)                 | 90–365 days |
| S3 (expiry)                  | 365 days    |

## CloudWatch Insights Saved Queries

| Query name              | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `errors-last-hour`      | All error logs, most recent first          |
| `slow-requests`         | HTTP requests taking > 1 s                 |
| `trace-by-request-id`   | Full request trace for a given `requestId` |
| `payout-failures`       | Errors related to payout events            |
| `high-latency-requests` | Aggregate latency stats per path           |

## Usage

```ts
import { logger } from '@/lib/logger';

// Simple log
logger.info('quote.fetched', { currency: 'NGN', amount: '100' });

// With request correlation (bind once per request)
const log = logger.withContext({ requestId });
log.info('bridge.submitted', { txHash });
log.error('payout.failed', { orderId }, error);
```
