#!/bin/bash
# Find commented-out code blocks in the codebase

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Searching for commented-out code blocks...${NC}"
echo ""

# Find commented code in TypeScript/JavaScript
echo -e "${YELLOW}📋 TypeScript/JavaScript files:${NC}"
find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -exec grep -l -E '(^[[:space:]]*//[[:space:]]*(function|const|let|var|class|export|import|if|for|while|switch|return|try|catch|throw)|^[[:space:]]*/\*[\s\S]*?\*/)' {} \; 2>/dev/null | while read -r file; do
    echo -e "  ${GREEN}$file${NC}"
    
    # Show a preview of commented code
    echo -e "${YELLOW}    Preview:${NC}"
    grep -n -E '(^[[:space:]]*//[[:space:]]*(function|const|let|var|class|export|import|if|for|while|switch|return|try|catch|throw)|^[[:space:]]*/\*[\s\S]*?\*/)' "$file" 2>/dev/null | head -5 | while read -r line; do
      echo -e "    $line"
    done
    echo ""
  done

# Find commented code in Rust
echo -e "${YELLOW}📋 Rust files:${NC}"
find contracts -type f -name "*.rs" \
  -not -path "*/target/*" \
  -exec grep -l -E '(^[[:space:]]*//[[:space:]]*(fn|struct|enum|impl|pub|mod|use|let|match|if|for|while|return|unsafe))' {} \; 2>/dev/null | while read -r file; do
    echo -e "  ${GREEN}$file${NC}"
    
    echo -e "${YELLOW}    Preview:${NC}"
    grep -n -E '(^[[:space:]]*//[[:space:]]*(fn|struct|enum|impl|pub|mod|use|let|match|if|for|while|return|unsafe))' "$file" 2>/dev/null | head -5 | while read -r line; do
      echo -e "    $line"
    done
    echo ""
  done

# Count total commented code blocks
echo -e "${BLUE}📊 Summary:${NC}"
TS_COUNT=$(find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -not -path "*/node_modules/*" -not -path "*/dist/*" -exec grep -l -E '(^[[:space:]]*//[[:space:]]*(function|const|let|var|class|export|import|if|for|while|switch|return|try|catch|throw)|^[[:space:]]*/\*[\s\S]*?\*/)' {} \; 2>/dev/null | wc -l)
RUST_COUNT=$(find contracts -type f -name "*.rs" -not -path "*/target/*" -exec grep -l -E '(^[[:space:]]*//[[:space:]]*(fn|struct|enum|impl|pub|mod|use|let|match|if|for|while|return|unsafe))' {} \; 2>/dev/null | wc -l)
TOTAL=$((TS_COUNT + RUST_COUNT))

echo -e "${BLUE}  Files with commented code: $TOTAL${NC}"
echo -e "${BLUE}  TypeScript/JavaScript: $TS_COUNT${NC}"
echo -e "${BLUE}  Rust: $RUST_COUNT${NC}"
