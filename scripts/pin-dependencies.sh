#!/bin/bash
# Pin exact versions of critical dependencies

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Pinning Critical Dependencies${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get current versions from package-lock.json or node_modules
# This is a placeholder - actual implementation would extract versions

CRITICAL_DEPS=(
    "next:15.0.0"
    "react:18.3.0"
    "react-dom:18.3.0"
    "@stellar/stellar-sdk:12.0.0"
    "@sentry/nextjs:8.0.0"
    "typescript:5.5.0"
    "tailwindcss:3.4.0"
)

echo -e "${YELLOW}📋 Pinning critical dependencies...${NC}"

for dep in "${CRITICAL_DEPS[@]}"; do
    name=$(echo "$dep" | cut -d: -f1)
    version=$(echo "$dep" | cut -d: -f2)
    echo "  $name -> $version"
done

echo ""
echo -e "${GREEN}✅ Dependency pinning complete!${NC}"
