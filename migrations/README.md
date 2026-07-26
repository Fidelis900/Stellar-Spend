# Database Migrations

This directory holds the SQL migrations for the Stellar-Spend Postgres database. This README is the procedural reference: **naming, numbering, file format, and rollback**.

For the *safety* rules that govern what a migration is allowed to do (expand/contract, no blocking locks, backward compatibility), see [`docs/database-migrations.md`](../docs/database-migrations.md). This document covers how to write and run one.

> **Read [Known issues](#known-issues) before adding a migration.** There are open problems in this directory — duplicate numbers and missing `-- up` / `-- down` markers — that affect whether your migration actually runs.

---

## Contents

- [The runner](#the-runner)
- [File format](#file-format)
- [Naming and numbering convention](#naming-and-numbering-convention)
- [Rollback procedure](#rollback-procedure)
- [Known issues](#known-issues)
- [Checklist for a new migration](#checklist-for-a-new-migration)

---

## The runner

All migrations are applied by [`scripts/migrate.ts`](../scripts/migrate.ts). There is no other migration tool in the project — no Prisma, Knex, Flyway, or `node-pg-migrate`. Anything you read elsewhere about migration tooling refers to this script.

State is tracked in a `schema_migrations` table, created automatically on first run:

| Column | Meaning |
|---|---|
| `id` | The numeric prefix of the filename, e.g. `017` — **primary key** |
| `name` | The filename without `.sql` |
| `applied_at` | Timestamp |
| `checksum` | SHA-256 of the `up` block |

### Commands

```bash
export DATABASE_URL=postgresql://user:pass@host:5432/dbname

npx ts-node scripts/migrate.ts up            # apply all pending migrations
npx ts-node scripts/migrate.ts dry-run       # list pending migrations, apply nothing
npx ts-node scripts/migrate.ts down [steps]  # roll back the last N migrations (default 1)
npx ts-node scripts/migrate.ts verify <id>   # apply, then immediately roll back, one migration
```

Flags: `--dry-run` (log statements instead of executing) and `--verbose`.

Any unrecognised command prints the usage text **and exits 0** — it does not fail. Check the output, not just the exit code.

### Where it runs

| Context | How |
|---|---|
| Local, Docker | `docker compose --profile migrate up migrate` |
| Local, direct | `npx ts-node scripts/migrate.ts up` with `DATABASE_URL` set |
| CI | [`.github/workflows/migration-checks.yml`](../.github/workflows/migration-checks.yml), triggered on changes to `migrations/**` or `scripts/migrate.ts` |

CI runs three jobs — lint, test, and dry-run — that gate deployment on `main`. See [Known issues](#known-issues) for what the lint job currently does and does not check.

---

## File format

**Every migration must contain `-- up` and `-- down` marker lines.** The runner splits the file on these markers:

- `up` = everything between `-- up` and `-- down`
- `down` = everything after `-- down`

A file with no markers parses to an **empty** `up` block. The runner will still record it in `schema_migrations` as applied, so the DDL never reaches the database and the failure is silent. This is the single most important rule in this document.

The markers are matched **literally and case-sensitively**. Write them exactly as `-- up` and `-- down`, lowercase, with a single space. `-- UP`, `--up` (no space), and `/* up */` do not match, and a file using them parses as if it had no markers at all.

### Template

```sql
-- up
-- Expand phase: additive changes only
CREATE TABLE IF NOT EXISTS example (
  id          TEXT PRIMARY KEY,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_example_created_at ON example (created_at);

-- down
-- Reverses the up block, in reverse order of creation
DROP INDEX IF EXISTS idx_example_created_at;
DROP TABLE IF EXISTS example;
```

No file in this directory is currently formatted this way (see [Known issues #2](#2-no-migration-in-this-directory-has---up----down-markers)) — use the template above, not an existing file, as your reference.

### Writing the `down` block

- Reverse the `up` operations in the opposite order to creation.
- Use `IF EXISTS` throughout, so a partially-applied migration can still be rolled back.
- **A `down` block is required even when the rollback is a no-op** — in that case, write a comment explaining why. An empty `down` and a deliberate no-op look identical to the runner, so make the intent explicit for the next reader.
- A `down` block cannot restore dropped data. If the `up` block destroys data, say so in a comment at the top of the file and see [Rollback procedure](#rollback-procedure).

---

## Naming and numbering convention

```
<NNN>_<verb>_<subject>.sql
```

### Number (`NNN`)

- Three digits, zero-padded, starting at `001`.
- **The number is the migration's identity.** The runner takes everything before the first `_` as the primary key of `schema_migrations`.
- **Numbers must be globally unique across this directory.** Two files sharing a number is not a cosmetic problem — see [Known issues](#known-issues).
- Take the next unused number, not the next number after the file you happened to open:

  ```bash
  ls migrations/*.sql | sed 's#.*/##' | cut -d_ -f1 | sort -n | tail -1
  ```

- Numbers are never reused, even after a migration is rolled back or its file is deleted.
- Do not renumber a migration that has been applied anywhere — the old number is already recorded in `schema_migrations` on those databases, and renumbering makes it run a second time.

#### Avoiding collisions on a shared branch

Numbers are assigned when a migration is written, but uniqueness only matters when branches merge. Two contributors branching from the same commit will both pick the same next number.

The convention is: **claim your number when you open the PR** — not when you start work — and re-check for a collision at rebase time. If someone else's migration merged first, renumber yours before merging. Renumbering an unmerged migration is safe; renumbering a merged one is not.

### Verb

Lowercase, one of:

| Verb | Use for |
|---|---|
| `create` | New tables |
| `add` | New columns, indexes, or constraints on existing tables |
| `alter` | Changing existing structures |
| `drop` | The contract phase of an expand/contract pair |
| `enhance`, `optimize` | Non-structural improvements — indexes, statistics |

### Subject

Lowercase `snake_case` describing what changes. Prefer the table name where there is one (`create_merchant_accounts`, `add_api_key_scopes`). Do not put issue or PR numbers in the filename — that is what the commit message and the file header comment are for.

### Header comment

Start each file with a comment naming the migration and its purpose:

```sql
-- Migration: 023_create_example_table
-- Adds the example table used by the X feature.
-- Issue: #123
```

---

## Rollback procedure

### Before you deploy

A rollback that has never been executed is a guess. Verify it against a scratch database:

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/scratch_db
npx ts-node scripts/migrate.ts verify 023
```

`verify` applies the migration and immediately rolls it back, then confirms the row is gone from `schema_migrations`. It prints `Rollback verification passed` on success. **Run it against a scratch database** — it really does apply your DDL.

### Rolling back

```bash
npx ts-node scripts/migrate.ts down 1     # last migration — the safe form
npx ts-node scripts/migrate.ts down 3     # last three — see the warning below
```

The runner selects the N highest `id`s from `schema_migrations`, executes each `down` block, and deletes the corresponding row.

> **Use `down 1`, repeatedly, rather than `down N`.**
> The runner selects the last N applied migrations but then iterates them in **ascending** order — oldest first. That is the reverse of the correct rollback order. If migration `022` depends on something `021` created, `down 2` tries to reverse `021` while `022` is still in place. Rolling back one at a time avoids the problem entirely.

### What rollback does not do

- **It is not transactional across migrations.** Each `down` block runs on its own. If the second of three fails, the first is already rolled back and the third is untouched. Roll back one at a time in production and check the state between each.
- **It does not restore data.** `down` reverses schema, not contents. A migration that drops a column loses that column's data permanently. This is the main reason the expand/contract pattern in [`docs/database-migrations.md`](../docs/database-migrations.md) requires drops to be a separate, later migration — so the rollback window closes only after the new path is proven.
- **It reads the `down` block from the working tree, not from the database.** The runner re-reads the `.sql` file at rollback time. Rolling back a migration whose file has since been edited executes the *current* `down` block against the *old* schema. Roll back from the same commit that deployed, and treat an applied migration's file as immutable.

### Production rollback sequence

1. **Roll back the application first, then the database.** The old application code must be able to run against the new schema — which is what expand/contract guarantees. Reversing this order means live code hits a schema it does not know.
2. Take a snapshot or confirm a recent backup exists. See [`docs/backup-recovery.md`](../docs/backup-recovery.md).
3. Roll back one migration at a time, confirming schema state between each.
4. If the `down` block fails partway, **do not re-run it** — a partially executed `down` is not idempotent unless every statement uses `IF EXISTS`. Inspect the schema and finish by hand.

### When rollback is not the answer

For a migration that has already destroyed data, or where `down` would drop a column now carrying live writes, do not roll back. Write a new forward migration that restores the needed structure, and restore data from backup. Rolling forward is almost always safer than rolling back once traffic has touched the new schema.

---

## Known issues

These are current, verifiable problems in this directory. They are documented here so they are not rediscovered one incident at a time. Fixing them is out of scope for this README.

### 1. Duplicate migration numbers (#788: `010`/`017`/`021` resolved)

`010`, `017`, and `021` were each used by more than one file, which — because `schema_migrations.id` was derived from the bare numeric prefix and is a primary key — broke the runner in two different ways depending on database state:

- **On a fresh database**, all files with the same number were pending at once. The first applied and inserted its row; the second ran its `up` block and then failed the `INSERT` on the primary key. The run aborted, having already executed SQL it did not record.
- **On an existing database**, the number was already in `schema_migrations`, so every other file sharing it was treated as applied and **skipped silently**. Its DDL never ran, and nothing reported a problem.

This is fixed as of `scripts/migrate.ts`'s `reconcileLegacyIds()`: the runner now keys `schema_migrations.id` off the filename slug with the numeric prefix stripped (e.g. `create_transaction_disputes`), not the number itself. On startup it re-keys any legacy row still using a bare-numeric id to the slug derived from that row's own `name` column, so renumbering these files does not desync already-applied tracking on any deployed database, whatever its actual applied state turns out to be. The colliding files (`010_add_ip_whitelisting.sql`, `010_add_query_indexes.sql`, `010_create_transaction_disputes.sql`; `017_create_onramp_transactions.sql`, `017_create_webhook_subscriptions.sql`; `021_add_webhook_schema_version.sql`, `021_db_optimization_701.sql`) were renumbered sequentially into `010`–`026` based on their actual git commit history order.

`001` and `002` each had two files (`001_create_transactions.sql`/`001_initial_schema.sql`, `002_add_balance.sql`/`002_add_transaction_analytics_fields.sql`) — same defect class, not renumbered when #790 shipped. As of #784, `001_initial_schema.sql` and `002_add_balance.sql` have been removed rather than renumbered: they described an unrelated, unreferenced `users`/`transactions` schema (UUID ids, `DECIMAL` amounts) from an early prototype that predates the Stellar-native schema (`TEXT` ids, `user_address`, beneficiary fields) every route and repository in `src/` actually uses. Nothing in the codebase queries a `users` table. `001_create_transactions.sql` and `002_add_transaction_analytics_fields.sql` are the sole, authoritative `001`/`002` migrations now — no duplicate prefixes remain anywhere in this directory.

To check for a new collision:

```bash
ls migrations/*.sql | sed 's#.*/##' | cut -d_ -f1 | sort | uniq -d
```

### 2. No migration in this directory has `-- up` / `-- down` markers

`001_initial_schema.sql` and `002_add_balance.sql` were the only two files that ever contained the markers the runner splits on; both were removed in #784 as dead schema (see above). Every remaining file parses to an empty `up` block and an empty `down` block.

The consequence is the silent failure described in [File format](#file-format): the runner records these migrations as applied without their SQL reaching the database, and `down` is a no-op, so they cannot be rolled back.

The schema these files describe is present in deployed environments, which means it was applied by some route other than this runner. Reconstructing the markers is mechanical for most files — the whole body becomes the `up` block — but the `down` blocks have to be written from scratch and verified individually.

**New migrations must include the markers.** Do not follow the majority pattern in this directory.

### 3. The CI lint job does not lint

[`migration-checks.yml`](../.github/workflows/migration-checks.yml) runs `npx ts-node scripts/migrate.ts lint`, but the runner's CLI has no `lint` command. The call falls through to the default branch, prints usage, and exits 0. The job passes unconditionally.

Two separate sets of lint rules exist and neither is reached by CI:

- `lintMigration()` inside `scripts/migrate.ts`, which is called during `applyMigration` — so it runs at apply time, not in CI.
- [`migrations/lint/rules.json`](./lint/rules.json), which is not read by any code in the repository.

Until this is wired up, **the safety rules in [`docs/database-migrations.md`](../docs/database-migrations.md) are enforced by review, not by tooling.** Check them by hand.

---

## Checklist for a new migration

- [ ] Filename follows `<NNN>_<verb>_<subject>.sql`, with `NNN` the next unused number (`ls migrations/*.sql | sed 's#.*/##' | cut -d_ -f1 | sort -n | tail -1`).
- [ ] No number collision (`... | sort | uniq -d` returns nothing).
- [ ] File contains `-- up` and `-- down` marker lines, each on its own line.
- [ ] Header comment names the migration and links the issue.
- [ ] `up` block is additive — expand phase only. Drops belong in a later migration.
- [ ] New columns are nullable or have a safe default; no rename or type change in place.
- [ ] Indexes on large tables use `CONCURRENTLY`.
- [ ] `down` block reverses `up` in reverse order, using `IF EXISTS`, or documents why it is a no-op.
- [ ] `npx ts-node scripts/migrate.ts verify <NNN>` passes against a scratch database.
- [ ] Rebased on `main` and re-checked for a number collision immediately before merge.

---

## See also

- [`docs/database-migrations.md`](../docs/database-migrations.md) — expand/contract, safety rules, zero-downtime deploys
- [`docs/database-schema.md`](../docs/database-schema.md) — the current schema
- [`docs/backup-recovery.md`](../docs/backup-recovery.md) — backup and restore
- [`scripts/migrate.ts`](../scripts/migrate.ts) — the runner
- [`tests/migrations/migration.test.ts`](../tests/migrations/migration.test.ts) — migration tests
