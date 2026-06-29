# Database Migration Safety

## Overview
Stellar-Spend uses the expand/contract pattern for zero-downtime database migrations.

## Expand/Contract Pattern

### Phase 1: Expand
1. Add new columns/tables (allow NULL)
2. Dual-write to both old and new schemas
3. Backfill data in batches
4. Deploy code that reads from both schemas

### Phase 2: Contract
1. Remove writes to old schema
2. Deploy code that reads from new schema only
3. Remove old columns/tables
4. Deploy code that writes to new schema only

## Migration Safety Rules

### No Blocking Locks
- Use `CONCURRENTLY` for indexes
- Add columns with default values in batches
- Avoid `LOCK TABLE` on critical tables

### Backward Compatible
- New columns must allow NULL
- Don't rename columns (use add/drop instead)
- Don't change column types (use add/drop instead)

### Rollback Ready
- Each migration must have a verified rollback
- Rollback should restore previous state
- Test rollback before deploying to production

## Migration Testing

### Dry Run
```bash
npm run migrate:dry-run
