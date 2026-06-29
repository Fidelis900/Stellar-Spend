# Monitoring, SLOs & Alerting

## Overview
Stellar-Spend uses Service Level Objectives (SLOs) with error budgets to maintain service reliability.

## SLO Definitions

| SLO | Description | Objective | Window | Burn Rate |
|-----|-------------|-----------|--------|-----------|
| api-availability | API request success rate | 99.9% | 30d | Critical: 14.4, Warning: 6 |
| payout-success-rate | Payout transaction success | 99.5% | 30d | Critical: 14.4, Warning: 6 |
| api-latency | API p95 latency | 95% < 2s | 30d | Critical: 14.4, Warning: 6 |
| indexer-lag | Indexer lag time | 99% < 60s | 30d | Critical: 14.4, Warning: 6 |

## Error Budgets

### How Error Budgets Work
- **Error budget** = 1 - SLO objective
- Example: 99.9% availability = 0.1% error budget
- **Burn rate** = (error rate) / (error budget)
- **Alert when**: Burn rate exceeds threshold

### Burn Rate Alerting
- **Critical**: Burn rate > 14.4 (error budget consumed in 1 hour)
- **Warning**: Burn rate > 6 (error budget consumed in 6 hours)

## SLI Metrics

### API Availability
```promql
# Success rate
sum(rate(http_requests_total{status_code<500}[5m])) / sum(rate(http_requests_total[5m]))
