import { Pool, PoolConfig } from 'pg';
import { logger } from '../logger';

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export class ConnectionPoolManager {
  private pools: Map<string, Pool> = new Map();
  private readonly defaultConfig: PoolConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  /**
   * Create or get a connection pool
   */
  getPool(connectionString: string, config?: Partial<PoolConfig>): Pool {
    const key = connectionString;

    if (this.pools.has(key)) {
      return this.pools.get(key)!;
    }

    const poolConfig: PoolConfig = {
      ...this.defaultConfig,
      ...config,
      connectionString,
    };

    const pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err });
    });

    this.pools.set(key, pool);
    logger.info('Connection pool created', {
      connectionString: key.substring(0, 50),
      maxConnections: poolConfig.max,
    });

    return pool;
  }

  /**
   * Get pool statistics
   */
  getPoolStats(connectionString: string): PoolStats | null {
    const pool = this.pools.get(connectionString);
    if (!pool) {
      return null;
    }

    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  }

  /**
   * Get all pool statistics
   */
  getAllPoolStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {};

    for (const [key, pool] of this.pools.entries()) {
      stats[key] = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };
    }

    return stats;
  }

  /**
   * Close a pool
   */
  async closePool(connectionString: string): Promise<void> {
    const pool = this.pools.get(connectionString);
    if (pool) {
      await pool.end();
      this.pools.delete(connectionString);
      logger.info('Connection pool closed', { connectionString });
    }
  }

  /**
   * Close all pools
   */
  async closeAllPools(): Promise<void> {
    for (const [key, pool] of this.pools.entries()) {
      await pool.end();
      this.pools.delete(key);
    }
    logger.info('All connection pools closed');
  }
}

export const connectionPoolManager = new ConnectionPoolManager();
