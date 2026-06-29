#!/usr/bin/env bash
# canary-deploy.sh
# Canary release for Stellar-Spend: builds on blue-green-deploy.sh by first
# routing a small traffic slice to the new version, watching success metrics
# for a bake window, then auto-promoting (full blue-green switch) or
# auto-rolling-back.
#
# Usage:
#   ./scripts/canary-deploy.sh [IMAGE_TAG]
#
# Requirements: docker, docker compose, curl
# Layers docker-compose.canary.yml on top of docker-compose.yml to run a
# second `app` container (same Postgres/Redis) on CANARY_PORT.
#
# Optional environment variables:
#   CANARY_PORT             - Port the canary stack listens on (default: 3002)
#   CANARY_BAKE_SECONDS     - How long to watch metrics before deciding (default: 300)
#   CANARY_CHECK_INTERVAL   - Seconds between metric checks during the bake (default: 30)
#   SLACK_WEBHOOK_URL       - Slack webhook for canary status notifications
#   DEPLOY_HISTORY_FILE     - Path to deploy history log (default: .deploy-history)

set -euo pipefail

IMAGE_TAG="${1:-latest}"
APP_IMAGE="stellar-spend:${IMAGE_TAG}"
HEALTH_URL="http://localhost"
CANARY_PORT="${CANARY_PORT:-3002}"
BASELINE_PORT="${BASELINE_PORT:-3000}"
CANARY_BAKE_SECONDS="${CANARY_BAKE_SECONDS:-300}"
CANARY_CHECK_INTERVAL="${CANARY_CHECK_INTERVAL:-30}"
DEPLOY_HISTORY_FILE="${DEPLOY_HISTORY_FILE:-.deploy-history}"
DEPLOY_START=$(date -u +%s)

# ── Notification helper ───────────────────────────────────────────────────────

notify() {
  local status="$1" message="$2"
  echo "==> [NOTIFY] ${status}: ${message}"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    local color
    case "$status" in
      SUCCESS) color="good" ;;
      FAILURE) color="danger" ;;
      *)       color="warning" ;;
    esac
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-type: application/json' \
      --data "{\"attachments\":[{\"color\":\"${color}\",\"text\":\"[stellar-spend][canary] ${message}\"}]}" \
      > /dev/null || true
  fi
}

record_deploy() {
  local status="$1" duration="$2"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) image=${IMAGE_TAG} mode=canary status=${status} duration=${duration}s" \
    >> "$DEPLOY_HISTORY_FILE"
}

# ── Health check ─────────────────────────────────────────────────────────────

health_check() {
  local port="$1"
  local url="${HEALTH_URL}:${port}/api/health"
  for i in $(seq 1 10); do
    if curl -sf "$url" | grep -q '"status":"operational"'; then
      echo "  Health check passed on port ${port}"
      return 0
    fi
    echo "  Attempt ${i}/10: waiting 5s..."
    sleep 5
  done
  echo "  ERROR: Health check failed after 10 attempts on port ${port}" >&2
  return 1
}

# ── Build & start the canary stack ────────────────────────────────────────────

echo "==> Building image ${APP_IMAGE}..."
docker build -t "$APP_IMAGE" .

echo "==> Starting canary stack on port ${CANARY_PORT}..."
notify "INFO" "Canary deploy started — image=${IMAGE_TAG} port=${CANARY_PORT}"
IMAGE_TAG="$IMAGE_TAG" CANARY_PORT="$CANARY_PORT" docker compose -f docker-compose.yml -f docker-compose.canary.yml up -d app

if ! health_check "$CANARY_PORT"; then
  docker compose -f docker-compose.yml -f docker-compose.canary.yml rm -sf app
  DURATION=$(( $(date -u +%s) - DEPLOY_START ))
  record_deploy "FAILED_HEALTH" "$DURATION"
  notify "FAILURE" "Canary FAILED (health check) — image=${IMAGE_TAG} duration=${DURATION}s"
  exit 1
fi

# ── Bake window: watch error rate / latency / payout success ────────────────

echo "==> Baking canary for ${CANARY_BAKE_SECONDS}s (checking every ${CANARY_CHECK_INTERVAL}s)..."
ELAPSED=0
while [ "$ELAPSED" -lt "$CANARY_BAKE_SECONDS" ]; do
  if ! BASELINE_PORT="$BASELINE_PORT" CANARY_PORT="$CANARY_PORT" \
      ./scripts/canary-metrics-check.sh; then
    echo "==> ROLLBACK: canary metrics breached threshold during bake." >&2
    docker compose -f docker-compose.yml -f docker-compose.canary.yml rm -sf app
    DURATION=$(( $(date -u +%s) - DEPLOY_START ))
    record_deploy "FAILED_METRICS" "$DURATION"
    notify "FAILURE" "Canary ROLLED BACK (metric breach) — image=${IMAGE_TAG} duration=${DURATION}s"
    exit 1
  fi
  sleep "$CANARY_CHECK_INTERVAL"
  ELAPSED=$(( ELAPSED + CANARY_CHECK_INTERVAL ))
  echo "  Bake progress: ${ELAPSED}/${CANARY_BAKE_SECONDS}s"
done

# ── Promote: hand off to blue-green to fully switch traffic ──────────────────

echo "==> Canary healthy for the full bake window. Promoting via blue-green switch..."
docker compose -f docker-compose.yml -f docker-compose.canary.yml rm -sf app

if ! ./scripts/blue-green-deploy.sh "$IMAGE_TAG"; then
  DURATION=$(( $(date -u +%s) - DEPLOY_START ))
  record_deploy "FAILED_PROMOTE" "$DURATION"
  notify "FAILURE" "Canary PASSED but promotion failed — image=${IMAGE_TAG} duration=${DURATION}s"
  exit 1
fi

DURATION=$(( $(date -u +%s) - DEPLOY_START ))
record_deploy "PROMOTED" "$DURATION"
notify "SUCCESS" "Canary PROMOTED — image=${IMAGE_TAG} duration=${DURATION}s"
echo "==> Canary deploy complete. Promoted ${IMAGE_TAG} after ${DURATION}s."
