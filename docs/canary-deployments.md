# Canary Deployments

Stellar-Spend supports canary releases that build on [blue-green deployment](blue-green-deployment.md): a new version first receives a small traffic slice on a side port, is watched against success metrics for a bake window, then is auto-promoted (full blue-green switch) or auto-rolled-back.

## How It Works

```
                  ┌─────────────────────────────────────────┐
                  │           Load Balancer / Nginx          │
                  └──────┬───────────────────────────┬──────┘
                          │ most traffic              │ canary slice
              ┌───────────▼───────────┐    ┌──────────▼──────────┐
              │  Baseline (port 3000) │    │  Canary (port 3002) │
              └────────────────────────┘    └──────────────────────┘
```

1. Build the new image and start it as a second `app` container on `CANARY_PORT` (`docker-compose.canary.yml` layered on `docker-compose.yml`, sharing the same Postgres/Redis).
2. Health-check the canary.
3. Bake: every `CANARY_CHECK_INTERVAL` seconds for `CANARY_BAKE_SECONDS`, run `scripts/canary-metrics-check.sh`, which compares the canary against the baseline on:
   - **Error rate** — `/api/health` probe failures (5xx/timeouts)
   - **Latency** — average response time vs. baseline, regression threshold
   - **Payout success** — the `Payment Providers` component in `/api/health`
   - **SLO dashboard** — `/api/slo/status` must report zero critical SLOs
4. Any breach during the bake stops the canary immediately (rollback) — the baseline is never touched.
5. If the canary survives the full bake window, `scripts/blue-green-deploy.sh` is invoked to fully promote it.

## Files

| File | Purpose |
|------|---------|
| `docker-compose.canary.yml` | Override exposing a second `app` container on `CANARY_PORT` |
| `scripts/canary-deploy.sh` | Orchestrates build → canary → bake → promote/rollback |
| `scripts/canary-metrics-check.sh` | Single pass of metric analysis, used during the bake loop |
| `src/app/api/slo/status/route.ts` | Exposes the SLO dashboard for promotion gating |
| `.github/workflows/canary-deploy.yml` | Manual workflow to trigger a canary deploy |

## Running a Canary Deploy

```bash
chmod +x scripts/canary-deploy.sh scripts/canary-metrics-check.sh scripts/blue-green-deploy.sh

# Deploy image tagged "v1.2.3" with a 5-minute bake window (default)
./scripts/canary-deploy.sh v1.2.3

# Shorter bake for a quick check
CANARY_BAKE_SECONDS=60 CANARY_CHECK_INTERVAL=15 ./scripts/canary-deploy.sh v1.2.3
```

Or trigger the `Canary Deploy` GitHub Action manually with an `image_tag` and `canary_bake_seconds` input.

## Tuning Thresholds

`scripts/canary-metrics-check.sh` reads:

| Env var | Default | Meaning |
|---|---|---|
| `PROBE_COUNT` | 10 | Requests sampled per check |
| `MAX_ERROR_RATE` | 0.05 | Max acceptable error rate (5%) |
| `MAX_LATENCY_REGRESSION_MS` | 500 | Max acceptable avg latency increase vs. baseline |

## Notifications

Set `SLACK_WEBHOOK_URL` to receive `[canary]`-prefixed Slack notifications for deploy start, rollback, and promotion — same mechanism as `blue-green-deploy.sh` and `rollback-drill.sh`.
