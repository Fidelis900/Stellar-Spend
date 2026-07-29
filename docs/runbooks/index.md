# Operations Runbook Library

> Structured incident-response guides for Stellar-Spend on-call engineers.

---

## Runbook Index

| #      | Runbook                                                        | Severity | Alert Link                   |
| ------ | -------------------------------------------------------------- | -------- | ---------------------------- |
| RB-001 | [Stuck Bridge Transaction](./stuck-bridge.md)                  | P1       | `ALERT_BRIDGE_STUCK`         |
| RB-002 | [Provider Outage (Paycrest / Allbridge)](./provider-outage.md) | P1       | `ALERT_PROVIDER_UNAVAILABLE` |
| RB-003 | [Database Failover](./database-failover.md)                    | P1       | `ALERT_DB_UNHEALTHY`         |
| RB-004 | [High Error Rate](./high-error-rate.md)                        | P2       | `ALERT_ERROR_RATE_HIGH`      |
| RB-005 | [Backup Failure](./backup-failure.md)                          | P2       | `ALERT_BACKUP_FAILED`        |

---

## Runbook Template

Every runbook follows this structure. Copy it when creating new ones.

```markdown
# RB-XXX: <Incident Title>

## Severity

P1 / P2 / P3

## Triggering Alerts

- ALERT_NAME

## Impact

One-sentence description of user / business impact.

## Prerequisites

- Access to AWS Console / CloudWatch
- Access to production DB (read-only replica preferred)
- On-call Slack channel: #ops-alerts

## Detection

How the incident is typically first noticed.

## Diagnosis Steps

Step-by-step triage commands and checks.

## Mitigation Steps

Actions to restore service, ordered by preference (quick wins first).

## Escalation

- If unresolved after 15 min → escalate to [Role] via [Channel]
- After 30 min → page [Secondary] + notify [Stakeholders]

## Post-Incident

Link to PIR template: docs/runbooks/post-incident-review.md

## Related Runbooks
```

---

## Escalation Matrix

| Severity                          | Response SLA | First Escalation              | Second Escalation               |
| --------------------------------- | ------------ | ----------------------------- | ------------------------------- |
| P1 — Service down / funds at risk | 15 min       | Infra lead (Slack DM + phone) | CTO + Legal (if funds impacted) |
| P2 — Degraded / partial outage    | 30 min       | Infra lead (Slack)            | Engineering manager             |
| P3 — Non-critical / monitoring    | 2 h          | Async Slack                   | N/A                             |

On-call rotation: managed in PagerDuty. See `#ops-oncall` for current schedule.

---

## Communications Templates

### Internal (Slack `#incidents`)

```
🔴 INCIDENT DECLARED — <Title>
Severity: P1
Impact: <one sentence>
Current status: Investigating
Incident commander: @<name>
Bridge: <Zoom/Meet link>
Updates every 15 min.
```

### External (Status page)

```
We are currently investigating an issue affecting <feature>.
Some users may experience <symptom>.
Our team is actively working to resolve this. Next update in 30 minutes.
```

### Resolution

```
✅ RESOLVED — <Title>
Duration: <X min>
Root cause: <one sentence>
Fix: <one sentence>
PIR: <link or "TBD within 48 h">
```

---

## Post-Incident Review (PIR) Process

1. **Within 24 h** — Incident commander creates a PIR doc from [post-incident-review.md](./post-incident-review.md).
2. **Within 48 h** — Engineering team completes the five-whys analysis.
3. **Within 1 week** — Action items assigned with owners and due dates.
4. **Monthly** — PIR summaries reviewed in engineering all-hands.

→ **PIR template:** [`docs/runbooks/post-incident-review.md`](./post-incident-review.md)

---

## Related Documentation

- [Disaster Recovery Plan](../disaster-recovery-plan.md)
- [Monitoring Guide](../monitoring.md)
- [Backup & Recovery](../backup-recovery.md)
- [Deployment Guide](../deployment-guide.md)
