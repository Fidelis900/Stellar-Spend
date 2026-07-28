import { pool } from './db/client';
import { logger } from './logger';

export interface IPWhitelistEntry {
  id: string;
  userAddress: string;
  ipAddress?: string;
  ipRangeStart?: string;
  ipRangeEnd?: string;
  label?: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export interface IPViolation {
  id: string;
  userAddress: string;
  ipAddress: string;
  violationType: 'unauthorized_access' | 'range_violation' | 'disabled_entry';
  severity: 'low' | 'medium' | 'high';
  details?: string;
  createdAt: number;
}

export class IPWhitelistService {
  async addIPAddress(
    userAddress: string,
    ipAddress: string,
    label?: string,
  ): Promise<IPWhitelistEntry> {
    const id = `ip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    await pool.query(
      `INSERT INTO ip_whitelist (id, user_address, ip_address, label, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userAddress, ipAddress, label || null, true, now],
    );

    logger.info(`IP address added to whitelist`, {
      userId: userAddress,
      ipAddress,
      entryId: id,
    });

    return {
      id,
      userAddress,
      ipAddress,
      label,
      isActive: true,
      createdAt: now,
    };
  }

  async addIPRange(
    userAddress: string,
    ipRangeStart: string,
    ipRangeEnd: string,
    label?: string,
  ): Promise<IPWhitelistEntry> {
    const id = `ip_range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    await pool.query(
      `INSERT INTO ip_whitelist (id, user_address, ip_range_start, ip_range_end, label, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userAddress, ipRangeStart, ipRangeEnd, label || null, true, now],
    );

    logger.info(`IP range added to whitelist`, {
      userId: userAddress,
      ipRangeStart,
      ipRangeEnd,
      entryId: id,
    });

    return {
      id,
      userAddress,
      ipRangeStart,
      ipRangeEnd,
      label,
      isActive: true,
      createdAt: now,
    };
  }

  async getWhitelistedIPs(userAddress: string): Promise<IPWhitelistEntry[]> {
    const result = await pool.query(
      `SELECT id, user_address, ip_address, ip_range_start, ip_range_end, label, is_active, created_at, last_used_at
       FROM ip_whitelist
       WHERE user_address = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [userAddress],
    );

    return result.rows.map((row) => ({
      id: row.id,
      userAddress: row.user_address,
      ipAddress: row.ip_address || undefined,
      ipRangeStart: row.ip_range_start || undefined,
      ipRangeEnd: row.ip_range_end || undefined,
      label: row.label || undefined,
      isActive: row.is_active,
      createdAt: Number(row.created_at),
      lastUsedAt: row.last_used_at ? Number(row.last_used_at) : undefined,
    }));
  }

  async isIPWhitelisted(userAddress: string, ipAddress: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT id FROM ip_whitelist
       WHERE user_address = $1 AND is_active = true
       AND (ip_address = $2 OR (ip_range_start IS NOT NULL AND ip_range_end IS NOT NULL))`,
      [userAddress, ipAddress],
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Check exact match
    const exactMatch = result.rows.some((row) => row.ip_address === ipAddress);
    if (exactMatch) {
      await this.updateLastUsed(userAddress, ipAddress);
      return true;
    }

    // Check range match
    for (const row of result.rows) {
      if (row.ip_range_start && row.ip_range_end) {
        if (this.isIPInRange(ipAddress, row.ip_range_start, row.ip_range_end)) {
          await this.updateLastUsed(userAddress, ipAddress);
          return true;
        }
      }
    }

    return false;
  }

  private isIPInRange(ip: string, start: string, end: string): boolean {
    const ipNum = this.ipToNumber(ip);
    const startNum = this.ipToNumber(start);
    const endNum = this.ipToNumber(end);
    return ipNum >= startNum && ipNum <= endNum;
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
  }

  private async updateLastUsed(userAddress: string, ipAddress: string): Promise<void> {
    await pool.query(
      `UPDATE ip_whitelist SET last_used_at = $1
       WHERE user_address = $2 AND ip_address = $3`,
      [Date.now(), userAddress, ipAddress],
    );
  }

  async removeIPEntry(userAddress: string, entryId: string): Promise<void> {
    await pool.query(
      `UPDATE ip_whitelist SET is_active = false
       WHERE id = $1 AND user_address = $2`,
      [entryId, userAddress],
    );

    logger.info(`IP whitelist entry disabled`, {
      userId: userAddress,
      entryId,
    });
  }

  async logViolation(
    userAddress: string,
    ipAddress: string,
    violationType: IPViolation['violationType'],
    severity: IPViolation['severity'],
    details?: string,
  ): Promise<IPViolation> {
    const id = `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    await pool.query(
      `INSERT INTO ip_violations (id, user_address, ip_address, violation_type, severity, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userAddress, ipAddress, violationType, severity, details || null, now],
    );

    logger.warn(`IP violation logged`, {
      userId: userAddress,
      ipAddress,
      violationType,
      severity,
    });

    return {
      id,
      userAddress,
      ipAddress,
      violationType,
      severity,
      details,
      createdAt: now,
    };
  }

  async getViolations(userAddress: string, limit = 50): Promise<IPViolation[]> {
    const result = await pool.query(
      `SELECT id, user_address, ip_address, violation_type, severity, details, created_at
       FROM ip_violations
       WHERE user_address = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userAddress, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      userAddress: row.user_address,
      ipAddress: row.ip_address,
      violationType: row.violation_type,
      severity: row.severity,
      details: row.details || undefined,
      createdAt: Number(row.created_at),
    }));
  }
}

export const ipWhitelistService = new IPWhitelistService();
