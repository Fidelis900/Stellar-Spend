# RB-005: Backup Failure

## Severity

P2

## Triggering Alerts

- `ALERT_BACKUP_FAILED` — AWS Backup or RDS automated backup job failed
- `ALERT_RPO_EXCEEDED` — most recent successful backup is > 30 minutes old

## Impact

No immediate service disruption, but recovery point is degraded. In the event of a concurrent database failure, data loss risk increases.

## Prerequisites

- AWS Console access (RDS, AWS Backup)
- AWS Backup vault name: `stellar-spend-backup-vault`

---

## Diagnosis Steps

### 1. Check AWS Backup job status

```bash
aws backup list-backup-jobs \
  --by-resource-type RDS \
  --by-state FAILED \
  --query 'BackupJobs[*].{Id:BackupJobId,Time:CreationDate,Status:State,Reason:StatusMessage}'
```

### 2. Check RDS automated backup

```bash
aws rds describe-db-instances \
  --db-instance-identifier stellar-spend-db \
  --query 'DBInstances[0].{BackupRetentionPeriod:BackupRetentionPeriod,LatestRestoreTime:LatestRestorableTime}'
```

### 3. Verify backup storage

```bash
aws s3 ls s3://stellar-spend-backups/ --recursive | tail -5
```

---

## Mitigation Steps

### A. Trigger a manual backup immediately

```bash
aws rds create-db-snapshot \
  --db-instance-identifier stellar-spend-db \
  --db-snapshot-identifier stellar-spend-manual-$(date +%Y%m%d%H%M)
```

### B. Investigate and fix the scheduled job

Common causes:

- IAM permission change affecting the backup role
- RDS maintenance window overlapping with backup window
- Storage capacity exhausted on the backup vault

Resolve the root cause, then re-enable the scheduled backup job in AWS Backup.

### C. Verify cross-region replication

```bash
aws s3 ls s3://stellar-spend-backups-replica/ | tail -3
```

If replication is behind, check the S3 replication rule in the AWS Console.

---

## Escalation

| Time elapsed | Action                                                     |
| ------------ | ---------------------------------------------------------- |
| 0–30 min     | On-call takes manual backup and diagnoses root cause       |
| 30 min       | Escalate to infra lead if scheduled job cannot be restored |

---

## Post-Incident

Update backup monitoring thresholds if the scheduled window is consistently tight. Review backup retention policy annually.

See: [Backup & Recovery](../backup-recovery.md), [Disaster Recovery Plan](../disaster-recovery-plan.md).

## Related Runbooks

- [RB-003: Database Failover](./database-failover.md)
