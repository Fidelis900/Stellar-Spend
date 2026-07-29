# Disaster Recovery Plan

## Overview

This document outlines the disaster recovery procedures for Stellar-Spend, ensuring business continuity and data protection.

## Recovery Objectives

| Metric                             | Target     | Current   |
| ---------------------------------- | ---------- | --------- |
| **RTO** (Recovery Time Objective)  | 1 hour     | < 1 hour  |
| **RPO** (Recovery Point Objective) | 15 minutes | 5 minutes |
| **Backup Retention**               | 90 days    | 90 days   |
| **Availability**                   | 99.9%      | 99.95%    |

## Backup Strategy

### Database Backups

- **Frequency**: Continuous with 5-minute RPO
- **Retention**: 30 days (daily), 90 days (weekly)
- **Encryption**: AWS KMS
- **Multi-AZ**: Enabled for automatic failover
- **Location**: AWS Backup Vault + S3 cross-region replication

### Application Data

- **Frequency**: Hourly
- **Retention**: 30 days
- **Encryption**: AES-256 with KMS
- **Location**: S3 with versioning enabled

### Configuration

- **Frequency**: On-demand
- **Retention**: Indefinite
- **Location**: Git repository + S3

## Disaster Recovery Procedures

### Scenario 1: Database Failure

**Detection**: CloudWatch alarms trigger on RDS metrics

**Recovery Steps**:

1. **Automatic Failover** (Multi-AZ)

   ```bash
   # AWS handles automatically
   # Failover time: 1-2 minutes
   ```

2. **Manual Recovery** (if needed)

   ```bash
   # Restore from backup
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier stellar-spend-restored \
     --db-snapshot-identifier <snapshot-id>
   ```

3. **Verify Data Integrity**

   ```bash
   # Run consistency checks
   npm run verify-db-integrity
   ```

4. **Update DNS/Connection Strings**
   ```bash
   # Update environment variables
   # Redeploy application
   ```

**Estimated Recovery Time**: 5-15 minutes

### Scenario 2: Application Server Failure

**Detection**: Health check failures

**Recovery Steps**:

1. **Auto-Scaling Triggers**

   ```bash
   # New instances launch automatically
   # Load balancer routes traffic
   ```

2. **Manual Intervention** (if needed)

   ```bash
   # Restart service
   kubectl rollout restart deployment/stellar-spend
   ```

3. **Verify Service Health**
   ```bash
   curl https://stellar-spend.com/api/health
   ```

**Estimated Recovery Time**: 2-5 minutes

### Scenario 3: Data Corruption

**Detection**: Data validation checks fail

**Recovery Steps**:

1. **Identify Corruption Point**

   ```bash
   # Check transaction logs
   # Identify last good backup
   ```

2. **Restore from Backup**

   ```bash
   # Restore to point-in-time
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier stellar-spend-db \
     --target-db-instance-identifier stellar-spend-restored \
     --restore-time <timestamp>
   ```

3. **Validate Data**

   ```bash
   npm run validate-data
   ```

4. **Failover**
   ```bash
   # Update DNS to restored instance
   ```

**Estimated Recovery Time**: 30-60 minutes

### Scenario 4: Regional Outage

**Detection**: Multiple service failures in region

**Recovery Steps**:

1. **Activate Disaster Recovery Region**

   ```bash
   # Restore from cross-region S3 backup
   aws s3 cp s3://stellar-spend-backups-replica/ . --recursive
   ```

2. **Restore Infrastructure**

   ```bash
   # Deploy to secondary region
   terraform apply -var-file=envs/dr-region.tfvars
   ```

3. **Update DNS**

   ```bash
   # Route53 failover policy
   # TTL: 60 seconds
   ```

4. **Verify Services**
   ```bash
   # Run smoke tests
   npm run test:e2e
   ```

**Estimated Recovery Time**: 30-60 minutes

## Testing

### Automated DR Drills

DR drills run automatically via the GitHub Actions workflow (`.github/workflows/dr-drill.yml`) every Monday at 02:00 UTC, and can be triggered manually.

```bash
# Run drill against staging (default)
./scripts/test-disaster-recovery.sh staging

# Run drill against production
./scripts/test-disaster-recovery.sh production

# Override RTO/RPO targets
RTO_TARGET_MINUTES=45 RPO_TARGET_MINUTES=15 ./scripts/test-disaster-recovery.sh staging
```

The script checks:

1. Backup vault existence
2. Completed recent backups
3. RDS backup retention and Multi-AZ configuration
4. S3 backup bucket accessibility, encryption, and versioning
5. Latest recovery point identification
6. **RPO assertion** — backup age ≤ RPO target (default 30 min)
7. **RTO estimate** — expected restore time ≤ RTO target (default 60 min)
8. Backup encryption
9. DR script availability (`restore-db.sh`, `verify-backup.sh`)

A timestamped report is written to `dr-drill-report-<env>-<timestamp>.txt` and a Slack notification is sent if `SLACK_WEBHOOK_URL` is configured.

### Quarterly Full DR Test

- Restore to secondary region
- Run full test suite
- Verify all services
- Document findings below
- Update procedures

## Drill Results

| Date | Environment | Result | RPO (actual) | RTO (est.) | Notes                              |
| ---- | ----------- | ------ | ------------ | ---------- | ---------------------------------- |
| —    | —           | —      | —            | —          | Awaiting first automated drill run |

> Drill reports are automatically uploaded as GitHub Actions artifacts and appended here after each quarterly full test.

## Monitoring

### Key Metrics

- Backup completion status
- Backup size and duration
- Recovery point age
- Replication lag
- Database health

### Alerts

| Alert              | Threshold | Action        |
| ------------------ | --------- | ------------- |
| Backup Failed      | Any       | Page on-call  |
| RPO Exceeded       | > 30 min  | Investigate   |
| Replication Lag    | > 5 min   | Check network |
| Database Unhealthy | Any       | Failover      |

## Runbooks

### Runbook 1: Database Restore

1. Identify backup to restore
2. Create new RDS instance from snapshot
3. Update security groups
4. Update application connection strings
5. Run data validation
6. Update DNS
7. Monitor for errors

### Runbook 2: Application Failover

1. Verify primary is down
2. Check secondary health
3. Update load balancer
4. Update DNS
5. Monitor metrics
6. Notify stakeholders

### Runbook 3: Data Recovery

1. Identify corruption
2. Find last good backup
3. Restore to point-in-time
4. Validate data integrity
5. Run consistency checks
6. Failover to restored instance

## Contacts

| Role           | Name | Phone           | Email                    |
| -------------- | ---- | --------------- | ------------------------ |
| On-Call        | TBD  | +1-XXX-XXX-XXXX | oncall@stellar-spend.com |
| Database Admin | TBD  | +1-XXX-XXX-XXXX | dba@stellar-spend.com    |
| Infrastructure | TBD  | +1-XXX-XXX-XXXX | infra@stellar-spend.com  |

## Documentation

- [Backup & Recovery](./backup-recovery.md)
- [Deployment Guide](./deployment-guide.md)
- [Infrastructure](./infrastructure.md)
- [Monitoring](./monitoring.md)

## Compliance

- **SOC 2**: Backup and recovery procedures documented
- **GDPR**: Data retention policies enforced
- **PCI DSS**: Encryption and access controls
- **ISO 27001**: Incident response procedures

## Change Log

| Date       | Change          | Author      |
| ---------- | --------------- | ----------- |
| 2026-05-29 | Initial DR plan | DevOps Team |
