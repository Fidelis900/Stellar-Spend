#!/bin/bash
# Audit dependencies for loose version ranges

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Dependency Version Audit${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ ! -f package.json ]; then
    echo -e "${RED}❌ package.json not found${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Critical dependencies with loose versions:${NC}"
echo ""

# Critical dependencies to check
CRITICAL_DEPS=(
    "next"
    "react"
    "react-dom"
    "@stellar/stellar-sdk"
    "@sentry/nextjs"
    "typescript"
    "tailwindcss"
    "@types/react"
    "@types/node"
)

for dep in "${CRITICAL_DEPS[@]}"; do
    # Find the version in package.json
    VERSION=$(grep -E "\"$dep\": *\"" package.json | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -n "$VERSION" ]; then
        # Check if it has ^ or ~
        if [[ "$VERSION" =~ ^[\^~] ]]; then
            echo -e "  ${RED}⚠️ $dep: $VERSION (loose)${NC}"
        else
            echo -e "  ${GREEN}✅ $dep: $VERSION (pinned)${NC}"
        fi
    fi
done

echo ""
echo -e "${GREEN}✅ Audit complete!${NC}"
