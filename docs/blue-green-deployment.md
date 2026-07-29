# Blue-Green Deployment

Stellar-Spend supports zero-downtime blue-green deployments using Docker Compose.

## How It Works

Two identical environments — **blue** (port 3000) and **green** (port 3001) — run side by side. Only one is active (receiving traffic) at a time. A new release is deployed to the inactive environment, health-checked, smoke-tested, then traffic is switched. If any gate fails, the new environment is stopped automatically and the active environment is left untouched.

```
                  ┌─────────────────────────────────────────┐
                  │           Load Balancer / Nginx          │
                  └──────────────┬──────────────────────────┘
                                 │ active traffic
                    ┌────────────▼────────────┐
                    │   Blue  (port 3000)     │  ← currently live
                    └─────────────────────────┘
                    ┌─────────────────────────┐
                    │   Green (port 3001)     │  ← idle / next deploy target
                    └─────────────────────────┘
```

## Files

| File                           | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `docker-compose.blue.yml`      | Blue environment (port 3000)                         |
| `docker-compose.green.yml`     | Green environment (port 3001)                        |
| `scripts/blue-green-deploy.sh` | Deploy new version to inactive slot                  |
| `scripts/rollback.sh`          | Roll back to the previous slot                       |
| `scripts/rollback-drill.sh`    | Periodic rollback drill with RTO assertion           |
| `.active-env`                  | Tracks which slot is currently active (auto-managed) |
| `.deploy-history`              | Append-only deploy history log (auto-managed)        |

## Deploy a New Version

```bash
# Make the scripts executable (first time only)
chmod +x scripts/blue-green-deploy.sh scripts/rollback.sh scripts/rollback-drill.sh

# Deploy image tagged "v1.2.3" (defaults to "latest" if omitted)
./scripts/blue-green-deploy.sh v1.2.3
```

The script:

1. Builds the new Docker image
2. Starts the inactive environment
3. Runs health checks against `/api/health` (up to 10 retries × 5 s)
4. Runs smoke tests (`/api/health`, `/api/offramp/currencies`)
5. Switches traffic by updating `.active-env`
6. Stops the old environment
7. Records the result to `.deploy-history`
8. Sends a Slack notification (if `SLACK_WEBHOOK_URL` is set)

If health checks or smoke tests fail, the new environment is stopped, the active slot stays live, and a failure notification is sent.

## Automatic Rollback

Auto-rollback is built into `blue-green-deploy.sh`. If either the health check or smoke tests fail on the new slot, the script:

- Stops the new (failing) environment
- Leaves the current active environment untouched
- Records `FAILED_HEALTH` or `FAILED_SMOKE` in `.deploy-history`
- Sends a `FAILURE` notification

## Manual Rollback

```bash
./scripts/rollback.sh
```

This starts the previously active environment, verifies it is healthy, switches traffic back, and stops the bad environment. A Slack notification is sent on completion.

## Rollback Drills

Periodic drills verify the entire deploy-then-rollback cycle and assert the RTO target:

```bash
# Run a drill with the default RTO target (120 s)
./scripts/rollback-drill.sh

# Override RTO target
RTO_TARGET_SECONDS=90 ./scripts/rollback-drill.sh v1.2.3
```

Schedule drills via cron or the GitHub Actions workflow (`.github/workflows/rollback-drill.yml`):

```cron
# Weekly rollback drill every Monday at 02:00 UTC
0 2 * * 1 cd /app && ./scripts/rollback-drill.sh latest
```

A drill report is written to `drill-report-<timestamp>.txt` in the working directory.

## Deploy History

Every deploy and rollback is appended to `.deploy-history`:

```
2026-06-27T10:00:00Z image=v1.2.3 slot=green  status=SUCCESS       duration=47s
2026-06-27T10:05:00Z image=v1.2.4 slot=blue   status=FAILED_SMOKE  duration=62s
2026-06-27T10:06:00Z image=rollback slot=green status=SUCCESS       duration=8s
```

## Notifications

Set `SLACK_WEBHOOK_URL` to receive deploy/rollback/drill notifications:

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
./scripts/blue-green-deploy.sh v1.2.3
```

Notification events: `Deploy started`, `Deploy SUCCESS/FAILURE`, `Rollback started`, `Rollback SUCCESS/FAILURE`, `Drill PASSED/FAILED`.

## Traffic Switching

The scripts write the active slot name to `.active-env`. In a real production setup, integrate the traffic switch step with your load balancer:

**Nginx example** — update `proxy_pass` and reload:

```nginx
upstream stellar_spend {
    server localhost:3000;  # change to 3001 for green
}
```

```bash
# After updating the upstream port:
nginx -s reload
```

**AWS ALB / ECS** — update the target group weights via the AWS CLI or console.

## Health Checks

Both environments expose `/api/health`. The deploy script polls this endpoint before switching traffic.

```bash
# Manual check
curl http://localhost:3000/api/health
curl http://localhost:3001/api/health
```
