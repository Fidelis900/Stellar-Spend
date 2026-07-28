# RB-001: Stuck Bridge Transaction

## Severity

P1

## Triggering Alerts

- `ALERT_BRIDGE_STUCK` — bridge status has been `pending` for > 20 minutes
- `ALERT_TX_TIMEOUT` — transaction timeout job flagged a transaction as stuck

## Impact

User funds are locked in-flight between Stellar and Base. No fiat settlement can proceed until the bridge releases funds. Affects individual users; does not block other transactions unless Allbridge is entirely down (see RB-002).

## Prerequisites

- Access to AWS CloudWatch (log insights)
- Access to Allbridge Explorer: https://explorer.allbridge.io
- Read-only DB access (replica)
- `STELLAR_HORIZON_URL` and Allbridge API credentials

---

## Detection

Typical discovery paths:

1. CloudWatch alarm `ALERT_BRIDGE_STUCK` pages on-call.
2. User reports via support that funds have not arrived.
3. Health check at `GET /api/health` returns degraded bridge status.

---

## Diagnosis Steps

### 1. Identify affected transactions

```sql
-- Transactions with bridge_status = 'pending' older than 20 minutes
SELECT id, stellar_tx_hash, bridge_status, timestamp, amount, currency
FROM transactions
WHERE bridge_status = 'pending'
  AND timestamp < (EXTRACT(EPOCH FROM NOW()) * 1000 - 1200000)
ORDER BY timestamp ASC;
```

### 2. Check Stellar transaction status

```bash
# Replace <TX_HASH> with stellar_tx_hash from the query above
curl "https://horizon.stellar.org/transactions/<TX_HASH>"
# Look for: "successful": true
```

If the Stellar transaction is NOT successful, the funds never left. The bridge was never triggered. See [mitigation step A](#a-stellar-tx-failed).

### 3. Check Allbridge status

```bash
# Poll bridge transfer status via the app API
curl "https://stellar-spend.com/api/offramp/bridge/status/<TX_HASH>"
# or query Allbridge directly
curl "https://core.allbridge.io/transfers?stellar_tx=<TX_HASH>"
```

Expected statuses: `IN_PROGRESS`, `COMPLETE`, `FAILED`.

### 4. Check Base-side receipt

If Allbridge status is `COMPLETE`, the USDC should be on Base. Check the payout wallet balance:

```bash
# Check Base wallet logs in CloudWatch
aws logs filter-log-events \
  --log-group-name /stellar-spend/server \
  --filter-pattern "payout execute-payout" \
  --start-time $(date -d '30 minutes ago' +%s000)
```

### 5. Check Paycrest order

```bash
curl -H "Authorization: Bearer $PAYCREST_API_KEY" \
  "https://api.paycrest.io/v1/orders/<PAYOUT_ORDER_ID>"
```

---

## Mitigation Steps

### A. Stellar TX failed

The signed XDR was submitted but the Stellar transaction failed (e.g., insufficient fee, bad sequence). **No funds moved.**

1. Notify the user that the transaction failed and their balance is unaffected.
2. Ask the user to retry the transaction from the app.
3. If the issue is systemic (many failures), check Horizon fee stats:
   ```bash
   curl "https://horizon.stellar.org/fee_stats"
   # If p99_accepted_fee is much higher than BASE_FEE_STROOPS (100),
   # the network is congested. Wait for congestion to ease.
   ```

### B. Allbridge delay (status IN_PROGRESS for 10–30 min)

This is within normal operating variance. Allbridge bridges typically complete in 5–10 minutes but can take up to 30 during high load.

1. Do nothing for up to 30 minutes from the Stellar TX timestamp.
2. After 30 minutes, check the Allbridge status page: https://status.allbridge.io
3. If Allbridge confirms delay, post to status page and notify affected users via email.

### C. Allbridge completed but USDC not sent to Paycrest

The bridge completed but the server did not create/send the Paycrest order.

1. Manually trigger the payout:
   ```bash
   # POST to the internal execute-payout route (requires server access)
   curl -X POST https://stellar-spend.com/api/offramp/execute-payout \
     -H "Content-Type: application/json" \
     -d '{"transactionId": "<TX_ID>"}'
   ```
2. Verify Paycrest order was created in the DB:
   ```sql
   SELECT payout_order_id, payout_status FROM transactions WHERE id = '<TX_ID>';
   ```

### D. Paycrest order stuck

The Paycrest order exists but is not settling.

1. Check Paycrest order status (step 5 of diagnosis).
2. If `PENDING` for > 2 hours, contact Paycrest support with the `orderId`.
3. As a last resort, request a Paycrest order refund and manually arrange return of funds.

---

## Escalation

| Time elapsed | Action                                             |
| ------------ | -------------------------------------------------- |
| 0–15 min     | On-call engineer diagnoses                         |
| 15 min       | Escalate to infra lead on Slack `#ops-alerts`      |
| 30 min       | Page secondary on-call; notify engineering manager |
| 1 h          | Funds at risk → escalate to CTO and legal          |

---

## Post-Incident

File a PIR within 24 hours using the template in [runbooks/index.md](./index.md#post-incident-review-pir-process).

Track recurring bridge issues in the `ALERT_BRIDGE_STUCK` alert history to identify whether Allbridge reliability requires an SLA review.

## Related Runbooks

- [RB-002: Provider Outage](./provider-outage.md)
- [RB-004: High Error Rate](./high-error-rate.md)
