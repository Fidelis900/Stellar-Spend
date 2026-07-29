import { logger } from '@/lib/logger';
import { Pool, PoolClient } from 'pg';
import { recordDbQuery } from '../performance';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Pool configuration with optimized settings
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
};

const _pool = new Pool(poolConfig);

// Pool event handlers for monitoring
_pool.on('error', (err: Error) => {
  logger.error('[db-pool] Unexpected error on idle client:', {}, err);
});

_pool.on('connect', () => {
  logger.debug('[db-pool] New connection established');
});

_pool.on('remove', () => {
  logger.debug('[db-pool] Connection removed from pool');
});

// Metrics tracking
const poolMetrics = {
  totalQueries: 0,
  activeConnections: 0,
  waitingRequests: 0,
  errors: 0,
};

export function getPoolMetrics() {
  return {
    ...poolMetrics,
    poolSize: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
  };
}

// Wrap pool.query to record timing for every DB call
export const pool: Pick<Pool, 'query'> = {
  query: async (...args: Parameters<Pool['query']>) => {
    const start = Date.now();
    poolMetrics.totalQueries++;
    poolMetrics.activeConnections = _pool.totalCount - _pool.idleCount;
    poolMetrics.waitingRequests = _pool.waitingCount;

    try {
      return await (_pool.query as (...a: unknown[]) => Promise<unknown>)(...args);
    } catch (err) {
      poolMetrics.errors++;
      throw err;
    } finally {
      const sql =
        typeof args[0] === 'string' ? args[0] : ((args[0] as { text?: string })?.text ?? '');
      recordDbQuery({
        query: sql.replace(/\s+/g, ' ').trim().slice(0, 80),
        durationMs: Date.now() - start,
        timestamp: start,
      });
    }
  },
} as Pick<Pool, 'query'>;

// Graceful shutdown
export async function closePool(): Promise<void> {
  await _pool.end();
  logger.info('[db-pool] Connection pool closed');
}
