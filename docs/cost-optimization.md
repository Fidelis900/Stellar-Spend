# Cost Monitoring and Optimization

## Overview

This document outlines cost monitoring strategies and optimization recommendations for Stellar-Spend infrastructure.

## Cost Allocation Tags

All resources are tagged with:

```hcl
Environment = var.environment
Project     = "stellar-spend"
CostCenter  = var.cost_center
Owner       = var.owner_email
ManagedBy   = "terraform"
```

These tags enable cost tracking and allocation across departments.

## Cost Monitoring

### AWS Cost Explorer

Access via AWS Console:

1. Navigate to Cost Management → Cost Explorer
2. Filter by tag: `Project = stellar-spend`
3. View costs by service, region, and time period

### Budget Alerts

Monthly budgets are configured per environment and per service:

**Total monthly budget** (`aws_budgets_budget.monthly`):

- **80% threshold** (forecasted): warning alert
- **100% threshold** (actual): breach alert
- Filtered by `Environment` tag (staging / production budgets are independent)

**Per-service budgets** (`aws_budgets_budget.per_service`):
| Service | Default Limit |
|---------|--------------|
| EC2 Compute | $400/mo |
| RDS | $300/mo |
| S3 | $100/mo |
| Lambda | $50/mo |
| CloudFront | $100/mo |

Override limits via `monthly_budget_by_service` in your `.tfvars` file.

### Anomaly Detection

AWS Cost Anomaly Detection monitors for unusual spending patterns:

- **Threshold**: $100 increase
- **Frequency**: Daily
- **Notification**: SNS topic → email

## Resource Utilization Monitoring

### EC2 Instances

Monitor CPU utilization and network traffic:

```bash
# View EC2 metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-xxxxx \
  --start-time 2026-05-22T00:00:00Z \
  --end-time 2026-05-29T00:00:00Z \
  --period 3600 \
  --statistics Average
```

**Optimization**: Downsize instances with < 10% average CPU utilization

### RDS Database

Monitor connections and CPU:

```bash
# View RDS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=stellar-spend-db \
  --start-time 2026-05-22T00:00:00Z \
  --end-time 2026-05-29T00:00:00Z \
  --period 3600 \
  --statistics Average
```

**Optimization**: Downsize instances with < 5 average connections

### NAT Gateway

Monitor data transfer costs:

```bash
# View NAT Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/NatGateway \
  --metric-name BytesOutToDestination \
  --start-time 2026-05-22T00:00:00Z \
  --end-time 2026-05-29T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

**Optimization**: Use VPC endpoints for AWS services to reduce NAT traffic

## Unused Resource Detection

### Unused EBS Volumes

```bash
# Find unused volumes
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].[VolumeId,Size,CreateTime]'
```

**Action**: Delete unused volumes (after backup)

### Unused Elastic IPs

```bash
# Find unassociated Elastic IPs
aws ec2 describe-addresses \
  --filters Name=association-id,Values=null \
  --query 'Addresses[*].[PublicIp,AllocationId]'
```

**Action**: Release unused Elastic IPs ($0.005/hour each)

### Unused NAT Gateways

Monitor data transfer:

- If < 1 GB/day: Consider removing
- Cost: $32/month + data transfer

## Cost Optimization Recommendations

### 1. Reserved Instances

For predictable workloads, purchase Reserved Instances:

```bash
# Calculate savings
aws ce get-reservation-purchase-recommendation \
  --service "Amazon Elastic Compute Cloud - Compute"
```

**Potential Savings**: 30-40% for 1-year commitments

### 2. Spot Instances

For non-critical workloads:

```bash
# Check Spot pricing
aws ec2 describe-spot-price-history \
  --instance-types t3.medium \
  --product-descriptions "Linux/UNIX"
```

**Potential Savings**: 70-90% vs on-demand

### 3. Right-Sizing

Analyze utilization and downsize:

| Current     | Recommended  | Monthly Savings |
| ----------- | ------------ | --------------- |
| t3.large    | t3.medium    | $20-30          |
| db.t3.large | db.t3.medium | $50-70          |
| 500GB EBS   | 250GB EBS    | $10-15          |

### 4. Data Transfer Optimization

- Use CloudFront for static content
- Use VPC endpoints for AWS services
- Consolidate data transfers

**Potential Savings**: $100-200/month

### 5. Storage Optimization

- Archive old backups to Glacier
- Delete unused snapshots
- Compress database backups

**Potential Savings**: $50-100/month

## Cost Dashboard

Access the cost optimization dashboard:

```bash
# View dashboard
aws cloudwatch get-dashboard \
  --dashboard-name stellar-spend-staging-cost-optimization
```

**Metrics**:

- Estimated monthly charges
- EC2 utilization
- RDS utilization
- NAT Gateway traffic

## Cost Optimization Lambda

Automated daily analysis runs via EventBridge (cron `0 8 * * ? *`). The Lambda uses **real CloudWatch metrics** to identify:

- **EC2 downsizing**: instances with average CPU < 10% over 7 days
- **EC2 termination**: instances idle (CPU < 2%, minimal NetworkOut) over 7 days
- **RDS downsizing**: databases with average connections < 5 over 7 days
- **RDS storage reduction**: databases with > 60% free storage
- **Cost spikes**: 7-day rolling average > 20% above the prior 23-day baseline

All findings are sent to the cost alerts SNS topic.

```bash
# Invoke manually
aws lambda invoke \
  --function-name stellar-spend-${ENVIRONMENT}-cost-optimizer \
  --payload '{}' \
  response.json
cat response.json
```

The Lambda IAM role has `cloudwatch:GetMetricStatistics`, `ce:GetCostAndUsage`, `ec2:DescribeInstances`, `rds:DescribeDBInstances`, and `sns:Publish` permissions.

## Monthly Cost Review

### Process

1. **Review Budget Status**

   - Check if on track
   - Identify variances

2. **Analyze Cost Trends**

   - Compare to previous months
   - Identify anomalies

3. **Review Recommendations**

   - Evaluate Lambda suggestions
   - Prioritize optimizations

4. **Implement Changes**

   - Downsize underutilized resources
   - Remove unused resources
   - Adjust configurations

5. **Document Savings**
   - Track implemented optimizations
   - Calculate actual savings

### Targets

| Metric               | Target   | Current |
| -------------------- | -------- | ------- |
| Monthly Cost         | < $5,000 | TBD     |
| Cost per Transaction | < $0.01  | TBD     |
| Resource Utilization | > 60%    | TBD     |
| Unused Resources     | 0        | TBD     |

## Cost Allocation

### By Service

- **Compute (EC2)**: 40%
- **Database (RDS)**: 30%
- **Storage (S3)**: 15%
- **Data Transfer**: 10%
- **Other**: 5%

### By Environment

- **Production**: 60%
- **Staging**: 25%
- **Development**: 15%

## Compliance

- **SOC 2**: Cost monitoring and controls
- **ISO 27001**: Resource management
- **Internal Policy**: Monthly cost reviews

## References

- [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home)
- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Well-Architected Framework - Cost Optimization](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/)
