# Scratch File Convention

## Overview
This document describes the convention for personal scratch files in the Stellar-Spend repository.

## Why This Convention

### Problems with Root-Level Scratch Files
- ❌ Clutter the repository root
- ❌ Confuse other contributors
- ❌ May accidentally contain sensitive information
- ❌ Can be mistaken for project documentation

### Solution
- ✅ Use a dedicated `scratch/` directory
- ✅ Directory is gitignored (not committed)
- ✅ Personal notes stay local
- ✅ Clean repository root

## Scratch Directory

### Location
# 1. Navigate to scratch directory
cd scratch

# 2. Create a dated note file
touch 2024-01-15-my-notes.md

# 3. Write your notes
echo "# My Notes" > 2024-01-15-my-notes.md
# Move a scratch file
mv task1.md scratch/task-notes-archive.md

# Verify it's not tracked
git status
cd scratch
touch my-notes.md
