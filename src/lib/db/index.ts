/**
 * Database module exports
 */

export { pool, pool as db, getPoolMetrics, closePool } from './client';
export { dal, DatabaseError } from './dal';
export type { DAL } from './dal';
export { queryOptimizer, QueryOptimizer, recordQueryMetrics } from './query-optimizer';
export type { QueryMetrics, QueryAnalysis } from './query-optimizer';
export { connectionPoolManager, ConnectionPoolManager } from './connection-pool';
export type { PoolStats } from './connection-pool';
