#!/bin/bash
# Verify TypeScript configs are working correctly

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Verifying TypeScript configurations...${NC}"

# Check base config exists
if [ -f tsconfig.base.json ]; then
    echo -e "${GREEN}✅ tsconfig.base.json exists${NC}"
else
    echo -e "${RED}❌ tsconfig.base.json missing${NC}"
    exit 1
fi

# Check root tsconfig extends base
if grep -q '"extends": "./tsconfig.base.json"' tsconfig.json; then
    echo -e "${GREEN}✅ Root tsconfig extends base${NC}"
else
    echo -e "${RED}❌ Root tsconfig does not extend base${NC}"
    exit 1
fi

# Check shared tsconfig extends base
if grep -q '"extends": "../../tsconfig.base.json"' packages/shared/tsconfig.json 2>/dev/null; then
    echo -e "${GREEN}✅ packages/shared/tsconfig extends base${NC}"
else
    echo -e "${RED}❌ packages/shared/tsconfig does not extend base${NC}"
    exit 1
fi

# Try compiling root
echo -e "${YELLOW}📦 Compiling root project...${NC}"
if npx tsc --noEmit; then
    echo -e "${GREEN}✅ Root project compiles${NC}"
else
    echo -e "${RED}❌ Root project compilation failed${NC}"
    exit 1
fi

# Try compiling shared
echo -e "${YELLOW}📦 Compiling packages/shared...${NC}"
if cd packages/shared && npx tsc --noEmit; then
    echo -e "${GREEN}✅ packages/shared compiles${NC}"
    cd ../..
else
    echo -e "${RED}❌ packages/shared compilation failed${NC}"
    cd ../..
    exit 1
fi

echo -e "${GREEN}✅ All TypeScript configurations verified!${NC}"
