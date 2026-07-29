# Post-Incident Review (PIR) Template

> Copy this file, rename it `PIR-YYYY-MM-DD-<title>.md`, and complete each section within 48 hours of the incident being resolved.

---

## Incident Summary

| Field                  | Value                                      |
| ---------------------- | ------------------------------------------ |
| **Title**              | _e.g. Stuck Bridge — Allbridge congestion_ |
| **Date**               | YYYY-MM-DD                                 |
| **Duration**           | _e.g. 47 minutes_                          |
| **Severity**           | P1 / P2 / P3                               |
| **Incident commander** | @github-handle                             |
| **Runbook used**       | _e.g. [RB-001](./stuck-bridge.md)_         |
| **Status**             | Resolved / Ongoing                         |

**Summary (2–3 sentences):**  
What happened, how long it lasted, and how many users were affected.

---

## Timeline

| Time (UTC) | Event                               |
| ---------- | ----------------------------------- |
| HH:MM      | Alert fired (`ALERT_NAME`)          |
| HH:MM      | On-call acknowledged                |
| HH:MM      | Incident declared; bridge created   |
| HH:MM      | Root cause hypothesised             |
| HH:MM      | Mitigation applied                  |
| HH:MM      | Service restored                    |
| HH:MM      | Incident resolved; all-clear posted |

---

## Impact

- **Users affected:** _number or "unknown"_
- **Transactions affected:** _number and status (stuck / failed / delayed)_
- **Revenue impact:** _estimated USD value of delayed / failed transactions_
- **SLA impact:** _was the 99.9% uptime SLA breached?_

---

## Root Cause Analysis

### What happened?

_Describe the technical sequence of events that led to the incident._

### Five-Whys

1. **Why** did the incident occur?  
   → _Answer_

2. **Why** did that happen?  
   → _Answer_

3. **Why** did that happen?  
   → _Answer_

4. **Why** did that happen?  
   → _Answer_

5. **Why** did that happen?  
   → _Root cause_

### Contributing Factors

- _Factor 1 (e.g., alert threshold too high)_
- _Factor 2 (e.g., runbook step ambiguous)_
- _Factor 3 (e.g., no automated retry)_

---

## What Went Well

- _Positive 1 (e.g., auto-failover triggered correctly)_
- _Positive 2 (e.g., on-call response within 5 minutes)_
- _Positive 3_

---

## What Could Be Improved

- _Improvement 1 (e.g., alert fired 10 minutes late)_
- _Improvement 2 (e.g., runbook lacked Base wallet balance check)_
- _Improvement 3_

---

## Action Items

| #   | Item | Owner   | Due Date   | Status |
| --- | ---- | ------- | ---------- | ------ |
| 1   |      | @handle | YYYY-MM-DD | Open   |
| 2   |      | @handle | YYYY-MM-DD | Open   |
| 3   |      | @handle | YYYY-MM-DD | Open   |

---

## Detection & Alerting Review

- Did the alert fire promptly? Yes / No — if no, why not?
- Was the alert severity correctly classified?
- Are the runbook steps accurate and complete? If not, file a docs PR.

---

## Communication Review

- Was the status page updated within 15 minutes of detection? Yes / No
- Were users notified appropriately? Yes / No
- Were internal stakeholders kept informed at the correct cadence? Yes / No

---

## Sign-off

| Role                | Name | Date |
| ------------------- | ---- | ---- |
| Incident commander  |      |      |
| Engineering manager |      |      |
| On-call engineer    |      |      |
