import { pool } from '../db/client';
import { encryptData, decryptData, hashData } from './encryption';
import { logger } from '../logger';

/**
 * Database encryption utilities for sensitive data
 */

/**
 * Encrypt sensitive columns in a table
 */
export async function encryptTableColumn(
  tableName: string,
  columnName: string,
  encryptedColumnName: string,
): Promise<{ encrypted: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let encrypted = 0;
  let failed = 0;

  try {
    // Get all rows with unencrypted data
    const result = await pool.query(
      `SELECT id, "${columnName}" FROM "${tableName}" WHERE "${encryptedColumnName}" IS NULL AND "${columnName}" IS NOT NULL`,
    );

    for (const row of result.rows) {
      try {
        const encryptedValue = encryptData(row[columnName] as string);
        await pool.query(`UPDATE "${tableName}" SET "${encryptedColumnName}" = $1 WHERE id = $2`, [
          encryptedValue,
          row.id,
        ]);
        encrypted++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Row ${row.id}: ${errorMsg}`);
        logger.error('column_encryption_failed', {
          table: tableName,
          column: columnName,
          rowId: row.id,
          error: errorMsg,
        });
      }
    }

    logger.info('table_column_encrypted', {
      table: tableName,
      column: columnName,
      encrypted,
      failed,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('table_encryption_failed', {
      table: tableName,
      column: columnName,
      error: errorMsg,
    });
    throw error;
  }

  return { encrypted, failed, errors };
}

/**
 * Decrypt sensitive columns in a table
 */
export async function decryptTableColumn(
  tableName: string,
  encryptedColumnName: string,
  columnName: string,
): Promise<{ decrypted: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let decrypted = 0;
  let failed = 0;

  try {
    // Get all rows with encrypted data
    const result = await pool.query(
      `SELECT id, "${encryptedColumnName}" FROM "${tableName}" WHERE "${encryptedColumnName}" IS NOT NULL`,
    );

    for (const row of result.rows) {
      try {
        const decryptedValue = decryptData(row[encryptedColumnName] as string);
        await pool.query(`UPDATE "${tableName}" SET "${columnName}" = $1 WHERE id = $2`, [
          decryptedValue,
          row.id,
        ]);
        decrypted++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Row ${row.id}: ${errorMsg}`);
        logger.error('column_decryption_failed', {
          table: tableName,
          column: encryptedColumnName,
          rowId: row.id,
          error: errorMsg,
        });
      }
    }

    logger.info('table_column_decrypted', {
      table: tableName,
      column: encryptedColumnName,
      decrypted,
      failed,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('table_decryption_failed', {
      table: tableName,
      column: encryptedColumnName,
      error: errorMsg,
    });
    throw error;
  }

  return { decrypted, failed, errors };
}

/**
 * Hash sensitive columns for searchability without decryption
 */
export async function hashTableColumn(
  tableName: string,
  columnName: string,
  hashColumnName: string,
): Promise<{ hashed: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let hashed = 0;
  let failed = 0;

  try {
    // Get all rows with unhashed data
    const result = await pool.query(
      `SELECT id, "${columnName}" FROM "${tableName}" WHERE "${hashColumnName}" IS NULL AND "${columnName}" IS NOT NULL`,
    );

    for (const row of result.rows) {
      try {
        const hashValue = hashData(row[columnName] as string);
        await pool.query(`UPDATE "${tableName}" SET "${hashColumnName}" = $1 WHERE id = $2`, [
          hashValue,
          row.id,
        ]);
        hashed++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Row ${row.id}: ${errorMsg}`);
        logger.error('column_hashing_failed', {
          table: tableName,
          column: columnName,
          rowId: row.id,
          error: errorMsg,
        });
      }
    }

    logger.info('table_column_hashed', {
      table: tableName,
      column: columnName,
      hashed,
      failed,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('table_hashing_failed', {
      table: tableName,
      column: columnName,
      error: errorMsg,
    });
    throw error;
  }

  return { hashed, failed, errors };
}

/**
 * Get encryption status for a table
 */
export async function getTableEncryptionStatus(
  tableName: string,
  encryptedColumnName: string,
): Promise<{
  total: number;
  encrypted: number;
  unencrypted: number;
  encryptionPercentage: number;
}> {
  try {
    const result = await pool.query(
      `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN "${encryptedColumnName}" IS NOT NULL THEN 1 END) as encrypted,
          COUNT(CASE WHEN "${encryptedColumnName}" IS NULL THEN 1 END) as unencrypted
        FROM "${tableName}"
      `,
    );

    const row = result.rows[0];
    const total = Number(row.total);
    const encrypted = Number(row.encrypted);
    const unencrypted = Number(row.unencrypted);
    const encryptionPercentage = total > 0 ? (encrypted / total) * 100 : 0;

    return {
      total,
      encrypted,
      unencrypted,
      encryptionPercentage,
    };
  } catch (error) {
    logger.error('encryption_status_check_failed', {
      table: tableName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Rotate encryption keys for a table column
 */
export async function rotateTableColumnEncryption(
  tableName: string,
  encryptedColumnName: string,
): Promise<{ rotated: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let rotated = 0;
  let failed = 0;

  try {
    // Get all encrypted rows
    const result = await pool.query(
      `SELECT id, "${encryptedColumnName}" FROM "${tableName}" WHERE "${encryptedColumnName}" IS NOT NULL`,
    );

    for (const row of result.rows) {
      try {
        // Decrypt with old key
        const decrypted = decryptData(row[encryptedColumnName] as string);
        // Re-encrypt with new key (which will be derived from updated ENCRYPTION_KEY env var)
        const reencrypted = encryptData(decrypted);
        await pool.query(`UPDATE "${tableName}" SET "${encryptedColumnName}" = $1 WHERE id = $2`, [
          reencrypted,
          row.id,
        ]);
        rotated++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Row ${row.id}: ${errorMsg}`);
        logger.error('column_key_rotation_failed', {
          table: tableName,
          column: encryptedColumnName,
          rowId: row.id,
          error: errorMsg,
        });
      }
    }

    logger.info('table_column_keys_rotated', {
      table: tableName,
      column: encryptedColumnName,
      rotated,
      failed,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('table_key_rotation_failed', {
      table: tableName,
      column: encryptedColumnName,
      error: errorMsg,
    });
    throw error;
  }

  return { rotated, failed, errors };
}

/**
 * Create encrypted backup of sensitive data
 */
export async function createEncryptedBackup(tableName: string, columns: string[]): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${tableName}"`,
    );

    const backup = {
      table: tableName,
      timestamp: Date.now(),
      rowCount: result.rows.length,
      data: result.rows,
      checksum: hashData(JSON.stringify(result.rows)),
    };

    const backupJson = JSON.stringify(backup);
    const encrypted = encryptData(backupJson);

    logger.info('encrypted_backup_created', {
      table: tableName,
      rowCount: result.rows.length,
    });

    return encrypted;
  } catch (error) {
    logger.error('encrypted_backup_creation_failed', {
      table: tableName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Restore encrypted backup
 */
export async function restoreEncryptedBackup(
  encryptedBackup: string,
  tableName: string,
): Promise<{ restored: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let restored = 0;
  let failed = 0;

  try {
    const backupJson = decryptData(encryptedBackup);
    const backup = JSON.parse(backupJson);

    // Verify checksum
    const checksum = hashData(JSON.stringify(backup.data));
    if (checksum !== backup.checksum) {
      throw new Error('Backup checksum verification failed');
    }

    if (backup.table !== tableName) {
      throw new Error(`Backup is for table ${backup.table}, not ${tableName}`);
    }

    for (const row of backup.data) {
      try {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        await pool.query(
          `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
          values,
        );
        restored++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Row: ${errorMsg}`);
        logger.error('backup_row_restore_failed', {
          table: tableName,
          error: errorMsg,
        });
      }
    }

    logger.info('encrypted_backup_restored', {
      table: tableName,
      restored,
      failed,
    });
  } catch (error) {
    logger.error('encrypted_backup_restoration_failed', {
      table: tableName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }

  return { restored, failed, errors };
}
