# RB-004: High Error Rate

## Severity

P2

## Triggering Alerts

- `ALERT_ERROR_RATE_HIGH` — 5xx rate > 5% over a 5-minute window
- Sentry alert: unhandled exception spike

## Impact

Degraded service. Some users experience errors. Transactions may fail but no funds are at risk unless the error is in the payout path.

## Prerequisites

- CloudWatch Logs Insights access
- Sentry access: https://sentry.io
- Read-only DB access

---

## Diagnosis Steps

### 1. Identify the failing endpoint

```bash
# Top 5xx-generating paths in the last 10 minutes
aws logs insights query \
  --log-group-name /stellar-spend/server \
  --start-time $(date -d '10 minutes ago' +%s) \
  --query-string 'filter status >= 500 | stats count() by path | sort count desc | limit 5'
```

### 2. Read error details in Sentry

Open the Sentry alert link in the page. Filter by `env:production` and sort by frequency. Look for a common root cause (stack trace, error message).

### 3. Check for recent deployments

```bash
git log --oneline -10
# or check GitHub Actions for the most recent deployment
```

A spike immediately after a deployment strongly suggests a regression.

---

## Mitigation Steps

### A. Regression after deployment

```bash
# Roll back to previous image
kubectl rollout undo deployment/stellar-spend
# Verify
kubectl rollout status deployment/stellar-spend
```

### B. Upstream dependency error (SDK, external API)

- If Allbridge SDK errors: check Allbridge status; errors are surfaced as 502.
- If DB errors: see RB-003.
- If environment variable missing: check app startup logs for `Invalid environment configuration`.

### C. Rate limiting false positives

If 429s (not 5xx) are elevated, review rate limit config in `src/lib/rate-limiting.ts` and adjust thresholds if legitimate traffic is being blocked.

---

## Escalation

| Time elapsed | Action                                          |
| ------------ | ----------------------------------------------- |
| 0–30 min     | On-call diagnoses and applies fix               |
| 30 min       | Escalate to engineering manager if not resolved |

---

## Related Runbooks

- [RB-001: Stuck Bridge](./stuck-bridge.md)
- [RB-002: Provider Outage](./provider-outage.md)
- [RB-003: Database Failover](./database-failover.md)
