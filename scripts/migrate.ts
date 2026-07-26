#!/usr/bin/env node

/**
 * Database Migration Script
 * Supports zero-downtime rolling deploys with expand/contract pattern
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
  applied: boolean;
  applied_at?: Date;
}

class MigrationRunner {
  private pool: Pool;
  private dryRun: boolean = false;
  private verbose: boolean = false;

  constructor(dryRun: boolean = false, verbose: boolean = false) {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.dryRun = dryRun;
    this.verbose = verbose;
  }

  async initialize(): Promise<void> {
    // Create migrations table if it doesn't exist
    await this.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
      );
    `);

    await this.reconcileLegacyIds();
  }

  // Older rows were keyed by bare numeric filename prefix (e.g. "010"), which
  // breaks the moment two files share a prefix (see migrations/README.md).
  // Re-key any such legacy row to the filename slug with the number
  // stripped, derived from the already-recorded `name` column, so renaming
  // migration files to fix numbering never desyncs applied-migration
  // tracking again. Safe to run on every startup: once a row's id is no
  // longer purely numeric this is a no-op for it.
  async reconcileLegacyIds(): Promise<void> {
    await this.query(`
      UPDATE schema_migrations
      SET id = regexp_replace(name, '^[0-9]+_', '')
      WHERE id ~ '^[0-9]+$'
    `);
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (this.dryRun) {
      console.log(`[DRY RUN] Would execute: ${sql.substring(0, 200)}...`);
      return { rows: [] };
    }
    
    if (this.verbose) {
      console.log(`[VERBOSE] Executing: ${sql.substring(0, 100)}...`);
    }
    
    const result = await this.pool.query(sql, params);
    return result;
  }

  async getAppliedMigrations(): Promise<Migration[]> {
    const result = await this.query(`
      SELECT id, name, applied_at 
      FROM schema_migrations 
      ORDER BY id
    `);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      applied: true,
      applied_at: row.applied_at,
    }));
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const applied = await this.getAppliedMigrations();
    const appliedIds = new Set(applied.map(m => m.id));
    
    // Read migration files
    const migrationFiles = fs.readdirSync('./migrations')
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    const migrations: Migration[] = [];
    
    for (const file of migrationFiles) {
      const name = file.replace(/\.sql$/, '');
      // Stable across renumbering: derived from the descriptive part of the
      // filename, not the numeric prefix. See reconcileLegacyIds().
      const id = name.replace(/^\d+_/, '');
      
      if (!appliedIds.has(id)) {
        const content = fs.readFileSync(`./migrations/${file}`, 'utf-8');
        const [up, down] = this.extractUpDown(content);
        
        migrations.push({
          id,
          name,
          up,
          down,
          applied: false,
        });
      }
    }
    
    return migrations;
  }

  extractUpDown(content: string): [string, string] {
    const upMatch = content.match(/-- up\s*([\s\S]*?)-- down/);
    const downMatch = content.match(/-- down\s*([\s\S]*?)$/);
    
    const up = upMatch ? upMatch[1].trim() : '';
    const down = downMatch ? downMatch[1].trim() : '';
    
    return [up, down];
  }

  async applyMigration(migration: Migration): Promise<void> {
    // Phase 1: Expand (add new columns/tables)
    console.log(`[EXPAND] Applying ${migration.name}...`);
    
    // Check if migration is safe (no blocking locks)
    const isSafe = this.lintMigration(migration.up);
    if (!isSafe) {
      console.error(`❌ Migration ${migration.name} failed linting!`);
      throw new Error('Migration safety check failed');
    }
    
    // Execute up migration
    await this.query(migration.up);
    
    // Record migration
    await this.query(`
      INSERT INTO schema_migrations (id, name, checksum)
      VALUES ($1, $2, $3)
    `, [migration.id, migration.name, this.calculateChecksum(migration.up)]);
    
    // Phase 2: Contract (remove old columns/tables after validation)
    // This is handled in a separate migration step (deprecated phase)
    
    console.log(`✅ Migration ${migration.name} applied successfully`);
  }

  async rollbackMigration(migration: Migration): Promise<void> {
    console.log(`[CONTRACT] Rolling back ${migration.name}...`);
    
    // Execute down migration
    await this.query(migration.down);
    
    // Remove migration record
    await this.query(`
      DELETE FROM schema_migrations WHERE id = $1
    `, [migration.id]);
    
    console.log(`✅ Migration ${migration.name} rolled back successfully`);
  }

  lintMigration(sql: string): boolean {
    // Check for potentially dangerous operations
    const dangerousPatterns = [
      /ALTER TABLE.*ADD.*DEFAULT.*\bDEFAULT\b/, // Adding default to large table
      /ALTER TABLE.*DROP\s+COLUMN/, // Dropping columns (should be done in contract phase)
      /CREATE\s+INDEX.*CONCURRENTLY/, // Should be done concurrently
      /ALTER TABLE.*RENAME\s+COLUMN/, // Renaming columns (requires expansion)
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        console.warn(`⚠️ Dangerous pattern detected: ${pattern}`);
        return false;
      }
    }
    
    // Check for large table operations
    // This would require analyzing table sizes in production
    return true;
  }

  calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async run(): Promise<void> {
    console.log('🔍 Checking pending migrations...');
    
    const pending = await this.getPendingMigrations();
    
    if (pending.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }
    
    console.log(`📋 Found ${pending.length} pending migrations:`);
    for (const migration of pending) {
      console.log(`  - ${migration.name} (${migration.id})`);
    }
    
    // Run migrations
    for (const migration of pending) {
      await this.applyMigration(migration);
    }
    
    console.log('✅ All migrations applied successfully');
  }

  async rollback(steps: number = 1): Promise<void> {
    console.log(`🔍 Rolling back ${steps} migration(s)...`);
    
    const applied = await this.getAppliedMigrations();
    
    if (applied.length === 0) {
      console.log('✅ No migrations to rollback');
      return;
    }
    
    const toRollback = applied.slice(-steps);
    
    for (const migration of toRollback) {
      const migrationFile = migration.name + '.sql';
      const content = fs.readFileSync(`./migrations/${migrationFile}`, 'utf-8');
      const [up, down] = this.extractUpDown(content);
      
      await this.rollbackMigration({
        ...migration,
        up,
        down,
        applied: true,
      });
    }
    
    console.log(`✅ Rolled back ${toRollback.length} migration(s)`);
  }

  async dryRunMigrations(): Promise<void> {
    console.log('🔍 DRY RUN: Checking migrations...');
    const pending = await this.getPendingMigrations();
    
    if (pending.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }
    
    console.log(`📋 Would apply ${pending.length} migrations:`);
    for (const migration of pending) {
      console.log(`  - ${migration.name} (${migration.id})`);
      console.log(`    UP: ${migration.up.substring(0, 100)}...`);
    }
  }

  async verifyRollback(migrationId: string): Promise<boolean> {
    console.log(`🔍 Verifying rollback for ${migrationId}...`);
    
    // Apply migration
    const pending = await this.getPendingMigrations();
    const migration = pending.find(m => m.id === migrationId);
    
    if (!migration) {
      console.log(`⚠️ Migration ${migrationId} not found or already applied`);
      return false;
    }
    
    // Apply
    await this.applyMigration(migration);
    
    // Rollback
    await this.rollbackMigration(migration);
    
    // Verify rollback completed
    const applied = await this.getAppliedMigrations();
    const found = applied.find(m => m.id === migrationId);
    
    if (!found) {
      console.log(`✅ Rollback verification passed for ${migrationId}`);
      return true;
    } else {
      console.log(`❌ Rollback verification failed for ${migrationId}`);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// CLI Handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'up';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  
  const runner = new MigrationRunner(dryRun, verbose);
  
  try {
    await runner.initialize();
    
    switch (command) {
      case 'up':
        await runner.run();
        break;
        
      case 'down':
        const steps = parseInt(args[1]) || 1;
        await runner.rollback(steps);
        break;
        
      case 'dry-run':
        await runner.dryRunMigrations();
        break;
        
      case 'verify':
        const migrationId = args[1];
        if (!migrationId) {
          console.error('❌ Migration ID required for verify command');
          process.exit(1);
        }
        await runner.verifyRollback(migrationId);
        break;
        
      default:
        console.log(`
Usage: migrate.ts [command] [options]

Commands:
  up                    Apply pending migrations
  down [steps]          Rollback migrations (default: 1)
  dry-run               Show pending migrations without applying
  verify <id>           Verify rollback for a specific migration

Options:
  --dry-run             Simulate migration without applying
  --verbose             Show detailed output
        `);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await runner.close();
  }
}

main();
