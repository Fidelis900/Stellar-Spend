import { env } from './env';
import packageJson from '../../package.json';

// Lazy import to avoid module-level DATABASE_URL throw in test environments
async function getPool() {
  const { pool } = await import('./db/client');
  return pool;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  version?: string;
}

export interface DependencyHealth {
  stellar: HealthCheckResult;
  base: HealthCheckResult;
  paycrest: HealthCheckResult;
  allbridge: HealthCheckResult;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  dependencies: DependencyHealth;
}

async function checkStellarRPC(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch(env.server.STELLAR_SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return { status: 'unhealthy', message: `HTTP ${response.status}`, responseTime };
    }

    const data = await response.json();
    if (data.result?.status === 'healthy') {
      return { status: 'healthy', responseTime };
    }

    return { status: 'degraded', message: 'Unexpected response', responseTime };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Connection failed',
      responseTime,
    };
  }
}

async function checkBaseRPC(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch(env.server.BASE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
      signal: AbortSignal.timeout(5000),
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return { status: 'unhealthy', message: `HTTP ${response.status}`, responseTime };
    }

    const data = await response.json();
    if (data.result) {
      return { status: 'healthy', responseTime };
    }

    return { status: 'degraded', message: 'No block number', responseTime };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Connection failed',
      responseTime,
    };
  }
}

async function checkPaycrestAPI(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.paycrest.io/aggregator/supported-currencies', {
      headers: {
        'x-api-key': env.server.PAYCREST_API_KEY,
      },
      signal: AbortSignal.timeout(5000),
    });

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return { status: 'unhealthy', message: `HTTP ${response.status}`, responseTime };
    }

    const data = await response.json();
    if (data.data && Array.isArray(data.data)) {
      return { status: 'healthy', responseTime };
    }

    return { status: 'degraded', message: 'Unexpected response format', responseTime };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Connection failed',
      responseTime,
    };
  }
}

async function checkAllbridgeSDK(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await import('@allbridge/bridge-core-sdk');

    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      sorobanNetworkPassphrase: 'Public Global Stellar Network ; September 2015',
      ...(env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL && {
        sorobanRpc: env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL,
      }),
      ...(env.server.BASE_RPC_URL && { ETH: env.server.BASE_RPC_URL }),
    });

    const chainDetails = await Promise.race([
      sdk.chainDetailsMap(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    const responseTime = Date.now() - start;

    if (chainDetails && typeof chainDetails === 'object') {
      return { status: 'healthy', responseTime };
    }

    return { status: 'degraded', message: 'No chain details', responseTime };
  } catch (error) {
    const responseTime = Date.now() - start;
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'SDK initialization failed',
      responseTime,
    };
  }
}

export async function performHealthCheck(): Promise<HealthCheckResponse> {
  const [stellar, base, paycrest, allbridge] = await Promise.all([
    checkStellarRPC(),
    checkBaseRPC(),
    checkPaycrestAPI(),
    checkAllbridgeSDK(),
  ]);

  const dependencies: DependencyHealth = { stellar, base, paycrest, allbridge };

  const unhealthyCount = Object.values(dependencies).filter((d) => d.status === 'unhealthy').length;
  const degradedCount = Object.values(dependencies).filter((d) => d.status === 'degraded').length;

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (unhealthyCount > 0) {
    overallStatus = 'unhealthy';
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: packageJson.version,
    dependencies,
  };
}

/**
 * Checks whether the PostgreSQL database is reachable and responding.
 * Used by the readiness probe to gate traffic.
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const pool = await getPool();
    await pool.query('SELECT 1');
    return { status: 'healthy', responseTime: Date.now() - start };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database unreachable',
      responseTime: Date.now() - start,
    };
  }
}
