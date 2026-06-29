import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

describe('Database Migrations', () => {
  let pool: Pool;

  beforeAll(async () => {
    // Use test database
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Drop and recreate test database
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should run migrations successfully', async () => {
    const { stdout, stderr } = await execAsync(
      'npx ts-node scripts/migrate.ts up --dry-run'
    );
    expect(stdout).toContain('Pending migrations');
  });

  it('should handle rollback correctly', async () => {
    const { stdout, stderr } = await execAsync(
      'npx ts-node scripts/migrate.ts down 1'
    );
    // Should complete without errors
    expect(stderr).toBe('');
  });

  it('should verify migration integrity', async () => {
    const { stdout, stderr } = await execAsync(
      'npx ts-node scripts/migrate.ts verify 001'
    );
    expect(stdout).toContain('Rollback verification passed');
  });

  it('should enforce linting rules', async () => {
    // This would test the linting rules
    const { stdout, stderr } = await execAsync(
      'npx ts-node scripts/migrate.ts lint'
    );
    expect(stdout).toContain('Linting passed');
  });
});
