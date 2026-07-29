# RB-002: Provider Outage (Paycrest / Allbridge)

## Severity

P1

## Triggering Alerts

- `ALERT_PROVIDER_UNAVAILABLE` — repeated 5xx responses from Paycrest or Allbridge APIs
- `ALERT_BRIDGE_QUOTE_UNAVAILABLE` — `/api/offramp/bridge/build-tx` returning 502

## Impact

- **Allbridge down:** No new off-ramp transactions can be initiated. Users see "Bridge quote unavailable" error.
- **Paycrest down:** Bridge can complete but fiat settlement cannot proceed. USDC accumulates in the payout wallet.
- **Both down:** Complete off-ramp outage.

## Prerequisites

- Access to AWS CloudWatch
- Paycrest status page: https://status.paycrest.io
- Allbridge status page: https://status.allbridge.io
- Paycrest support contact (in team 1Password vault)

---

## Detection

1. CloudWatch alarm `ALERT_PROVIDER_UNAVAILABLE` fires when >5 consecutive provider API calls fail.
2. Users report inability to get quotes or receive funds.
3. Health endpoint `GET /api/health` shows provider connectivity failures.

---

## Diagnosis Steps

### 1. Confirm which provider is affected

```bash
# Check CloudWatch logs for provider errors
aws logs filter-log-events \
  --log-group-name /stellar-spend/server \
  --filter-pattern '"provider" "error"' \
  --start-time $(date -d '10 minutes ago' +%s000) \
  | jq '.events[].message'
```

### 2. Test provider connectivity directly

```bash
# Allbridge — fetch supported chains
curl -s "https://core.allbridge.io/chains" | jq '.[] | .name'

# Paycrest — check rate endpoint
curl -s -H "Authorization: Bearer $PAYCREST_API_KEY" \
  "https://api.paycrest.io/v1/rates?token=USDC&currency=NGN"
```

### 3. Check provider status pages

- Allbridge: https://status.allbridge.io
- Paycrest: https://status.paycrest.io

### 4. Identify transaction blast radius

```sql
-- Transactions that will be affected (pending, not yet settled)
SELECT COUNT(*), provider_affected
FROM (
  SELECT id,
    CASE
      WHEN bridge_status IN ('pending','in_progress') THEN 'allbridge'
      WHEN payout_status IN ('pending','processing') THEN 'paycrest'
      ELSE 'both'
    END AS provider_affected
  FROM transactions
  WHERE status = 'pending'
) t
GROUP BY provider_affected;
```

---

## Mitigation Steps

### A. Allbridge outage

1. **Post to status page** immediately:

   > We are currently experiencing issues with our bridge provider. New off-ramp transactions cannot be initiated. Existing transactions in-flight will resume automatically when the provider recovers.

2. **Enable maintenance mode** (blocks new transactions, shows maintenance banner):

   ```bash
   # Set feature flag via API (requires admin token)
   curl -X PATCH https://stellar-spend.com/api/admin/feature-flags/maintenance \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"enabled": true, "message": "Bridge provider maintenance. Service resumes shortly."}'
   ```

3. **Monitor recovery:** Poll `https://core.allbridge.io/chains` every 2 minutes.

4. **On recovery:**
   - Disable maintenance mode.
   - Trigger retry of any in-flight transactions that timed out:
     ```sql
     -- Find transactions to retry
     SELECT id FROM transactions
     WHERE bridge_status = 'pending'
       AND timestamp < (EXTRACT(EPOCH FROM NOW()) * 1000 - 3600000);
     ```

### B. Paycrest outage

1. **Post to status page:**

   > Bridge transfers are completing normally, but fiat bank settlements are temporarily delayed due to a payment processor issue. Funds will settle automatically once the processor recovers.

2. **Do NOT initiate new Paycrest orders** while the provider is down; USDC will accumulate in the payout wallet and orders will be created when connectivity is restored.

3. **Monitor payout wallet balance:**

   ```bash
   # Check Base payout wallet USDC balance (via viem/Base RPC)
   # See scripts/ for wallet balance check utility
   ```

4. **On recovery:** Confirm queued Paycrest orders are processing. Check payout wallet drains over the next 30 minutes.

### C. Extended outage (> 2 hours)

1. Contact provider support directly (details in 1Password vault: `ops/provider-contacts`).
2. Assess whether a backup provider can be activated (see ADR-009 for provider routing).
3. Notify users via email if outage exceeds 4 hours.

---

## Escalation

| Time elapsed | Action                                              |
| ------------ | --------------------------------------------------- |
| 0–15 min     | On-call confirms outage and posts status update     |
| 15 min       | Escalate to infra lead; contact provider support    |
| 2 h          | Engineering manager + head of product informed      |
| 4 h          | CTO informed; consider user communication via email |

---

## Post-Incident

File PIR within 24 hours. Evaluate whether provider SLAs are adequate and whether a failover provider should be promoted.

## Related Runbooks

- [RB-001: Stuck Bridge Transaction](./stuck-bridge.md)
- [RB-003: Database Failover](./database-failover.md)
