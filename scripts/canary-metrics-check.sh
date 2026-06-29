#!/usr/bin/env bash
# canary-metrics-check.sh
# Single pass of canary success-metric analysis: error rate, latency, and
# payout-provider health on the canary, gated additionally on the SLO
# dashboard (src/lib/performance-monitoring.ts via /api/slo/status).
#
# Exit 0  -> canary is healthy, safe to keep baking / promote.
# Exit 1  -> metric breach, caller should roll back.
#
# Usage:
#   ./scripts/canary-metrics-check.sh
#
# Optional environment variables:
#   CANARY_PORT          - Port the canary stack listens on (default: 3002)
#   BASELINE_PORT         - Port the current production stack listens on (default: 3000)
#   PROBE_COUNT           - Number of requests sampled per check (default: 10)
#   MAX_ERROR_RATE         - Max acceptable error rate, 0-1 (default: 0.05)
#   MAX_LATENCY_REGRESSION_MS - Max acceptable p-avg latency increase vs. baseline (default: 500)

set -uo pipefail

HEALTH_URL="http://localhost"
CANARY_PORT="${CANARY_PORT:-3002}"
BASELINE_PORT="${BASELINE_PORT:-3000}"
PROBE_COUNT="${PROBE_COUNT:-10}"
MAX_ERROR_RATE="${MAX_ERROR_RATE:-0.05}"
MAX_LATENCY_REGRESSION_MS="${MAX_LATENCY_REGRESSION_MS:-500}"

# Probes a port's /api/health PROBE_COUNT times, printing "errors avg_latency_ms".
probe() {
  local port="$1"
  local errors=0
  local total_ms=0

  for _ in $(seq 1 "$PROBE_COUNT"); do
    local start_ms end_ms status
    start_ms=$(date +%s%3N)
    status=$(curl -s -o /dev/null -w '%{http_code}' "${HEALTH_URL}:${port}/api/health" || echo "000")
    end_ms=$(date +%s%3N)
    total_ms=$(( total_ms + (end_ms - start_ms) ))
    if [ "$status" -lt 200 ] || [ "$status" -ge 500 ]; then
      errors=$(( errors + 1 ))
    fi
  done

  echo "${errors} $(( total_ms / PROBE_COUNT ))"
}

echo "==> Probing canary (port ${CANARY_PORT})..."
read -r CANARY_ERRORS CANARY_AVG_MS <<< "$(probe "$CANARY_PORT")"
CANARY_ERROR_RATE=$(awk -v e="$CANARY_ERRORS" -v n="$PROBE_COUNT" 'BEGIN { printf "%.4f", e / n }')

echo "==> Probing baseline (port ${BASELINE_PORT}) for comparison..."
read -r BASELINE_ERRORS BASELINE_AVG_MS <<< "$(probe "$BASELINE_PORT")"

echo "  Canary   : errors=${CANARY_ERRORS}/${PROBE_COUNT} (rate=${CANARY_ERROR_RATE}) avg_latency=${CANARY_AVG_MS}ms"
echo "  Baseline : errors=${BASELINE_ERRORS}/${PROBE_COUNT} avg_latency=${BASELINE_AVG_MS}ms"

FAIL=0

if awk -v r="$CANARY_ERROR_RATE" -v m="$MAX_ERROR_RATE" 'BEGIN { exit !(r > m) }'; then
  echo "  [BREACH] canary error rate ${CANARY_ERROR_RATE} exceeds threshold ${MAX_ERROR_RATE}" >&2
  FAIL=1
fi

LATENCY_DELTA=$(( CANARY_AVG_MS - BASELINE_AVG_MS ))
if [ "$LATENCY_DELTA" -gt "$MAX_LATENCY_REGRESSION_MS" ]; then
  echo "  [BREACH] canary latency regression ${LATENCY_DELTA}ms exceeds threshold ${MAX_LATENCY_REGRESSION_MS}ms" >&2
  FAIL=1
fi

# Payout provider health, reported as a component in /api/health.
PAYOUT_STATUS=$(curl -sf "${HEALTH_URL}:${CANARY_PORT}/api/health" \
  | grep -oP '"name":"Payment Providers","status":"\K[a-z]*' || echo "unknown")
if [ "$PAYOUT_STATUS" != "operational" ]; then
  echo "  [BREACH] payout provider status on canary is '${PAYOUT_STATUS}', expected 'operational'" >&2
  FAIL=1
fi

# Gate on the SLO dashboard: no SLO should be in critical state.
SLO_CRITICAL=$(curl -sf "${HEALTH_URL}:${CANARY_PORT}/api/slo/status" \
  | grep -o '"critical":[0-9]*' | head -1 | grep -o '[0-9]*$' || echo "0")
if [ "${SLO_CRITICAL:-0}" -gt 0 ]; then
  echo "  [BREACH] SLO dashboard reports ${SLO_CRITICAL} critical SLO(s)" >&2
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  exit 1
fi

echo "  [OK] canary metrics within thresholds"
exit 0
