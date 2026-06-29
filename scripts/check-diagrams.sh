#!/usr/bin/env bash
# check-diagrams.sh — verify that all required diagram source files exist
# and contain at least one mermaid code block.
#
# Usage: bash scripts/check-diagrams.sh
# Exit code: 0 = all good, 1 = missing or empty diagram.
#
# Add this to CI to prevent architecture diagrams from drifting silently.

set -euo pipefail

DIAGRAMS_DIR="docs/diagrams"
PASS=0
FAIL=1
errors=0

required_files=(
  "architecture.md"
  "offramp-flow.md"
  "bridge-transaction.md"
  "paycrest-order.md"
  "webhook-handling.md"
)

echo "Checking architecture diagram sources in ${DIAGRAMS_DIR}/ ..."
echo ""

for file in "${required_files[@]}"; do
  path="${DIAGRAMS_DIR}/${file}"

  if [ ! -f "$path" ]; then
    echo "  ❌ MISSING: ${path}"
    errors=$((errors + 1))
    continue
  fi

  # Require at least one ```mermaid block
  if ! grep -q '```mermaid' "$path"; then
    echo "  ❌ NO MERMAID: ${path} has no \`\`\`mermaid block"
    errors=$((errors + 1))
    continue
  fi

  echo "  ✅ ${path}"
done

echo ""

if [ "$errors" -gt 0 ]; then
  echo "FAILED: ${errors} diagram check(s) failed."
  echo ""
  echo "To fix:"
  echo "  1. Ensure every required file exists in ${DIAGRAMS_DIR}/"
  echo "  2. Each file must contain at least one \`\`\`mermaid code block"
  echo "  3. Keep diagrams up to date when the architecture changes"
  exit $FAIL
fi

echo "All diagram checks passed."
exit $PASS
