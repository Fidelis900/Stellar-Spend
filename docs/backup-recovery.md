# Backup & Disaster Recovery

This document covers the backup strategy, verification procedures, and recovery runbook for the Stellar-Spend PostgreSQL database.

## Table of Contents

- [Backup strategy](#backup-strategy)
- [RTO / RPO targets](#rto--rpo-targets)
- [Verifying backups](#verifying-backups)
- [Recovery procedures](#recovery-procedures)
- [Disaster recovery drill](#disaster-recovery-drill)
- [Runbook: database failure](#runbook-database-failure)

---

## Backup strategy

Backups are managed by **AWS RDS automated snapshots**, configured in [`terraform/rds.tf`](../terraform/rds.tf).

| Setting                   | Staging         | Production         |
| ------------------------- | --------------- | ------------------ |
| Backup retention          | 7 days          | 30 days            |
| Backup window (UTC)       | 03:00–04:00     | 03:00–04:00        |
| Maintenance window        | Sun 04:00–05:00 | Sun 04:00–05:00    |
| Multi-AZ                  | No              | Yes                |
| Storage encryption        | Yes (AES-256)   | Yes (AES-256)      |
| Deletion protection       | No              | Yes                |
| Final snapshot on destroy | No              | Yes                |
| Performance Insights      | 7 days          | 731 days (2 years) |

RDS takes one automated snapshot per day within the backup window. Point-in-time recovery (PITR) is available for any moment within the retention window.

DB credentials are stored in **AWS Secrets Manager** at `stellar-spend-<env>/db-credentials`.

---

## RTO / RPO targets

| Metric                         | Target       | Notes                                                |
| ------------------------------ | ------------ | ---------------------------------------------------- |
| RPO (Recovery Point Objective) | ≤ 24 hours   | Last automated snapshot; PITR reduces this to ~5 min |
| RTO (Recovery Time Objective)  | ≤ 30 minutes | Snapshot restore typically takes 10–20 min           |

For production, Multi-AZ provides automatic failover to the standby replica in **1–2 minutes** for instance-level failures without requiring a manual restore.

---

## Verifying backups

Run the verification script daily (or hook it into a cron/CI job):

```bash
./scripts/verify-backup.sh stellar-spend-production-db
```

The script checks:

1. Automated backup retention is ≥ 1 day
2. Most recent snapshot exists, is `available`, and is ≤ 25 hours old
3. Snapshot is encrypted
4. DB instance status is `available`
5. (Optional) Schema tables exist and `transactions` is queryable — set `DATABASE_URL` to enable

Exit code `0` = all checks passed. Exit code `1` = one or more checks failed.

### Scheduling verification

Add to cron (runs daily at 06:00 UTC, after the backup window):

```cron
0 6 * * * /path/to/scripts/verify-backup.sh stellar-spend-production-db >> /var/log/backup-verify.log 2>&1
```

Or add a GitHub Actions scheduled job:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/verify-backup.sh stellar-spend-production-db
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Recovery procedures

### Option A: Restore from latest snapshot (most common)

```bash
./scripts/restore-db.sh \
  --source-db stellar-spend-production-db \
  --target-db stellar-spend-production-db-restored \
  --run-migrations
```

This will:

1. Find the most recent automated snapshot
2. Restore it to a new RDS instance
3. Wait for the instance to become available (~10–20 min)
4. Replay all SQL migrations (idempotent)
5. Print the new endpoint and cutover steps

### Option B: Restore from a specific snapshot

```bash
# List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier stellar-spend-production-db \
  --snapshot-type automated \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table

# Restore a specific one
./scripts/restore-db.sh \
  --source-db stellar-spend-production-db \
  --target-db stellar-spend-production-db-restored \
  --snapshot rds:stellar-spend-production-db-2026-04-24-03-00
```

### Option C: Point-in-time recovery

Restore to any second within the retention window:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier stellar-spend-production-db \
  --target-db-instance-identifier stellar-spend-production-db-pitr \
  --restore-time 2026-04-25T02:30:00Z \
  --db-instance-class db.t4g.micro \
  --no-publicly-accessible \
  --region us-east-1
```

### Cutover steps (after any restore)

1. Confirm the restored instance is healthy:

   ```bash
   ./scripts/verify-backup.sh stellar-spend-production-db-restored
   ```

2. Update the DB connection string in Secrets Manager:

   ```bash
   NEW_ENDPOINT=$(aws rds describe-db-instances \
     --db-instance-identifier stellar-spend-production-db-restored \
     --query 'DBInstances[0].Endpoint.Address' --output text)

   # Update the secret (retrieve current values first, then update the url/host fields)
   aws secretsmanager put-secret-value \
     --secret-id stellar-spend-production/db-credentials \
     --secret-string "{\"host\":\"$NEW_ENDPOINT\", ...}"
   ```

3. Force a new ECS deployment to pick up the new connection string:

   ```bash
   aws ecs update-service \
     --cluster stellar-spend-production \
     --service stellar-spend-production-svc \
     --force-new-deployment \
     --region us-east-1
   ```

4. Verify the application is healthy:

   ```bash
   curl -f https://<alb-dns>/api/health
   ```

5. Once confirmed, rename or delete the old instance.

---

## Disaster recovery drill

Run a full end-to-end DR drill monthly against the production snapshot. The drill is non-destructive — it creates a temporary instance and deletes it automatically on exit.

```bash
./scripts/test-disaster-recovery.sh stellar-spend-production-db
```

The drill runs five phases:

1. **Verify source backups** — runs `verify-backup.sh`
2. **Restore snapshot** — creates `stellar-spend-production-db-drtest-<timestamp>`
3. **Validate instance** — checks status and encryption
4. **Schema & data integrity** — verifies all tables exist and are queryable
5. **Migration idempotency** — replays all migrations to confirm they are safe to re-run

At the end it reports:

- **RTO estimate** — actual restore duration
- **RPO estimate** — age of the snapshot used

The test instance is deleted automatically via a `trap` on exit, even if the script fails.

### Scheduling drills

```cron
# Monthly DR drill on the 1st at 02:00 UTC
0 2 1 * * /path/to/scripts/test-disaster-recovery.sh stellar-spend-production-db >> /var/log/dr-drill.log 2>&1
```

---

## Runbook: database failure

### Symptoms

- `/api/health` returns 5xx
- ECS tasks restarting with database connection errors
- CloudWatch alarm `stellar-spend-production-db-backup-failed` firing

### Decision tree

```
Is the RDS instance available?
├── YES → Check application logs for connection string / credential issues
│         → Rotate credentials if needed, force ECS redeployment
└── NO  → Is Multi-AZ failover in progress?
          ├── YES → Wait 1–2 minutes for automatic failover, then verify
          └── NO  → Run restore procedure (Option A above)
                    Estimated recovery time: 10–30 minutes
```

### Quick commands

```bash
# Check instance status
aws rds describe-db-instances \
  --db-instance-identifier stellar-spend-production-db \
  --query 'DBInstances[0].{Status:DBInstanceStatus,MultiAZ:MultiAZ,Endpoint:Endpoint.Address}' \
  --output table

# Check recent events
aws rds describe-events \
  --source-identifier stellar-spend-production-db \
  --source-type db-instance \
  --duration 60 \
  --output table

# Trigger restore
./scripts/restore-db.sh \
  --source-db stellar-spend-production-db \
  --target-db stellar-spend-production-db-recovery-$(date +%Y%m%d) \
  --run-migrations
```
