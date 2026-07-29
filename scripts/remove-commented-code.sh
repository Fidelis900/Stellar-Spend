#!/bin/bash
# Remove commented-out code blocks

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo "Usage: $0 <file-path>"
  echo "Example: $0 src/components/MyComponent.tsx"
  exit 1
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo -e "${RED}❌ File not found: $FILE${NC}"
  exit 1
fi

echo -e "${YELLOW}🗑️ Removing commented code from: $FILE${NC}"

# Create backup
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$FILE" "$BACKUP_DIR/$(basename $FILE).bak"
echo -e "${GREEN}📦 Backup saved to $BACKUP_DIR/$(basename $FILE).bak${NC}"

# Remove commented code lines
# This is a simple approach - removes lines that are commented-out code
# More sophisticated approach would be needed for complex cases

# Remove single-line commented code (lines that start with // and contain code patterns)
sed -i '/^[[:space:]]*\/\/[[:space:]]*(function|const|let|var|class|export|import|if|for|while|switch|return|try|catch|throw|fn|struct|enum|impl|pub|mod|use|match|unsafe)/d' "$FILE"

# Remove multi-line commented code (simplified - removes /* */ blocks)
# This is a simplified approach - use with caution
perl -0777 -i -pe 's/\/\*[\s\S]*?\*\///g' "$FILE" 2>/dev/null || true

echo -e "${GREEN}✅ Commented code removed from $FILE${NC}"
