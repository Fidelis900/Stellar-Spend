# RB-003: Database Failover

## Severity

P1

## Triggering Alerts

- `ALERT_DB_UNHEALTHY` — RDS health check failing
- `ALERT_DB_REPLICATION_LAG` — replica lag > 5 minutes
- `ALERT_DB_CONNECTIONS_EXHAUSTED` — connection pool at 100%
- `ALERT_BACKUP_FAILED` — see also RB-005

## Impact

Full application outage. All API endpoints depending on the database (all transaction endpoints, auth, KYC, webhooks) return 500. Users cannot initiate or track transactions.

## Prerequisites

- AWS Console access (RDS, CloudWatch)
- DB admin credentials (1Password vault: `ops/db-admin`)
- Terraform state access (for infrastructure changes)
- `psql` client or `scripts/migrate.ts` for post-failover validation

---

## Detection

1. CloudWatch alarm fires on RDS `DatabaseConnections` or `ReadLatency` metrics.
2. Health endpoint `GET /api/health` returns `{"status":"unhealthy","db":"unreachable"}`.
3. Application logs show `ECONNREFUSED` or `connection timeout` errors.

---

## Diagnosis Steps

### 1. Check RDS status in AWS Console

```
AWS Console → RDS → Databases → stellar-spend-db
```

Look at: Status, Multi-AZ, Recent Events tab.

### 2. Check CloudWatch metrics

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=stellar-spend-db \
  --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Average
```

### 3. Classify the failure

| Symptom                           | Likely cause                                              |
| --------------------------------- | --------------------------------------------------------- |
| RDS status "failed"               | Hardware / AZ failure → automatic failover should trigger |
| High connections, DB responsive   | Connection pool exhaustion → restart app pods             |
| Replica lag > 5 min               | Network issue or write storm → monitor or promote replica |
| `pg_stat_activity` locked queries | Long-running query blocking others → identify and kill    |

---

## Mitigation Steps

### A. Automatic Multi-AZ failover

AWS RDS Multi-AZ automatically promotes the standby replica in 1–2 minutes. Verify:

```bash
aws rds describe-db-instances \
  --db-instance-identifier stellar-spend-db \
  --query 'DBInstances[0].{Status:DBInstanceStatus,AZ:AvailabilityZone,MultiAZ:MultiAZ}'
```

Wait for `Status: available`. The application will reconnect automatically once the DNS failover propagates (typically < 60 seconds).

### B. Connection pool exhaustion

Too many application instances holding idle connections.

```bash
# Identify current connections
psql -h $DB_HOST -U $DB_USER -c "
  SELECT state, COUNT(*) FROM pg_stat_activity
  WHERE datname = 'stellar_spend'
  GROUP BY state;
"

# Terminate idle connections older than 5 minutes
psql -h $DB_HOST -U $DB_USER -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'stellar_spend'
    AND state = 'idle'
    AND query_start < NOW() - INTERVAL '5 minutes';
"
```

If caused by a deployment surge, scale down excess application pods:

```bash
kubectl scale deployment stellar-spend --replicas=2
```

### C. Manual failover (if automatic fails)

```bash
# Force Multi-AZ failover
aws rds reboot-db-instance \
  --db-instance-identifier stellar-spend-db \
  --force-failover
```

This causes a 30–60 second outage. Use only if automatic failover has not triggered after 5 minutes.

### D. Restore from snapshot (data corruption / catastrophic failure)

```bash
# List recent snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier stellar-spend-db \
  --query 'DBSnapshots[*].{Id:DBSnapshotIdentifier,Time:SnapshotCreateTime,Status:Status}' \
  | jq 'sort_by(.Time) | reverse | .[0:5]'

# Restore to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier stellar-spend-restored \
  --db-snapshot-identifier <SNAPSHOT_ID> \
  --db-instance-class db.t3.medium \
  --multi-az

# Update DATABASE_URL env var to point at restored instance, then redeploy
```

After restore, run integrity validation:

```bash
npx ts-node scripts/migrate.ts --validate
```

### E. Point-in-time recovery

For data corruption with a known corruption timestamp:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier stellar-spend-db \
  --target-db-instance-identifier stellar-spend-pitr \
  --restore-time "2026-06-27T10:00:00Z"
```

---

## Post-Failover Validation Checklist

- [ ] `GET /api/health` returns `{"status":"healthy"}`
- [ ] Test transaction query: `GET /api/offramp/currencies` returns 200
- [ ] Verify in-flight transactions resumed correctly (check `bridge_status = 'pending'` count)
- [ ] Confirm replication is re-established (new standby provisioned within 30 min)
- [ ] Check application error rate in CloudWatch returns to baseline

---

## Escalation

| Time elapsed | Action                                                    |
| ------------ | --------------------------------------------------------- |
| 0–5 min      | Confirm automatic failover triggered; monitor             |
| 5 min        | If no auto-failover, page infra lead + begin manual steps |
| 15 min       | Engineering manager informed; post status update          |
| 30 min       | CTO informed                                              |

---

## Post-Incident

File PIR within 24 hours. Include:

- Root cause of DB failure
- Failover duration and whether Multi-AZ performed as expected
- Any data loss (compare RPO against backup records)
- Action items (e.g., increase PIOPS, adjust connection pool settings)

See: [Disaster Recovery Plan](../disaster-recovery-plan.md), [Backup & Recovery](../backup-recovery.md).

## Related Runbooks

- [RB-004: High Error Rate](./high-error-rate.md)
- [RB-005: Backup Failure](./backup-failure.md)
