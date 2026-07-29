/**
 * Tests for #798 — liveness and readiness health check endpoints.
 *
 * The liveness route is a process-alive signal and never calls external deps.
 * The readiness route calls performHealthCheck() and checkDatabaseHealth()
 * and returns 200/503 depending on dependency availability.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ── Mock health-check module ──────────────────────────────────────────────────
const mockPerformHealthCheck = vi.fn();
const mockCheckDatabaseHealth = vi.fn();

vi.mock('@/lib/health-check', () => ({
  performHealthCheck: (...args: unknown[]) => mockPerformHealthCheck(...args),
  checkDatabaseHealth: (...args: unknown[]) => mockCheckDatabaseHealth(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function healthy(responseTime = 42) {
  return { status: 'healthy' as const, responseTime };
}

function unhealthy(message = 'Connection refused', responseTime = 100) {
  return { status: 'unhealthy' as const, message, responseTime };
}

function degraded(message = 'Slow response', responseTime = 300) {
  return { status: 'degraded' as const, message, responseTime };
}

function makeHealthResponse(overrides: {
  stellar?: ReturnType<typeof healthy>;
  paycrest?: ReturnType<typeof healthy>;
  allbridge?: ReturnType<typeof healthy>;
} = {}) {
  return {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    dependencies: {
      stellar: overrides.stellar ?? healthy(),
      base: healthy(),
      paycrest: overrides.paycrest ?? healthy(),
      allbridge: overrides.allbridge ?? healthy(),
    },
  };
}

// ── Import route handlers after mocks ────────────────────────────────────────
async function getLiveness() {
  const { GET } = await import('@/app/api/health/liveness/route');
  return GET();
}

async function getReadiness() {
  const { GET } = await import('@/app/api/health/readiness/route');
  return GET();
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/health/liveness', () => {
  it('returns 200 with status=alive', async () => {
    const response = await getLiveness();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('alive');
    expect(body.timestamp).toBeDefined();
  });

  it('does not call any external dependency', async () => {
    await getLiveness();
    expect(mockPerformHealthCheck).not.toHaveBeenCalled();
    expect(mockCheckDatabaseHealth).not.toHaveBeenCalled();
  });
});

describe('GET /api/health/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when all dependencies are healthy', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(healthy());
    mockPerformHealthCheck.mockResolvedValue(makeHealthResponse());

    const response = await getReadiness();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('healthy');
    expect(body.checks.stellar.status).toBe('healthy');
  });

  it('returns 503 when database is unhealthy', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(unhealthy('ECONNREFUSED'));
    mockPerformHealthCheck.mockResolvedValue(makeHealthResponse());

    const response = await getReadiness();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('not_ready');
    expect(body.checks.database.status).toBe('unhealthy');
    expect(body.checks.database.message).toBe('ECONNREFUSED');
  });

  it('returns 503 when Stellar RPC is unhealthy', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(healthy());
    mockPerformHealthCheck.mockResolvedValue(
      makeHealthResponse({ stellar: unhealthy('Stellar node unreachable') }),
    );

    const response = await getReadiness();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('not_ready');
    expect(body.checks.stellar.status).toBe('unhealthy');
  });

  it('returns 200 when non-critical dep (paycrest) is degraded', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(healthy());
    mockPerformHealthCheck.mockResolvedValue(
      makeHealthResponse({ paycrest: degraded() }),
    );

    const response = await getReadiness();
    // paycrest degraded does not block readiness — only DB and Stellar are critical
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.checks.paycrest.status).toBe('degraded');
  });

  it('returns 200 when non-critical dep (allbridge) is degraded', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(healthy());
    mockPerformHealthCheck.mockResolvedValue(
      makeHealthResponse({ allbridge: degraded('SDK timeout') }),
    );

    const response = await getReadiness();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ready');
  });

  it('returns 503 when both DB and Stellar are unhealthy', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(unhealthy('No DB'));
    mockPerformHealthCheck.mockResolvedValue(
      makeHealthResponse({ stellar: unhealthy('RPC down') }),
    );

    const response = await getReadiness();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('not_ready');
  });

  it('includes timestamp in response', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(healthy());
    mockPerformHealthCheck.mockResolvedValue(makeHealthResponse());

    const response = await getReadiness();
    const body = await response.json();
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it('exposes all expected check keys', async () => {
    mockCheckDatabaseHealth.mockResolvedValue(healthy());
    mockPerformHealthCheck.mockResolvedValue(makeHealthResponse());

    const response = await getReadiness();
    const body = await response.json();
    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('stellar');
    expect(body.checks).toHaveProperty('paycrest');
    expect(body.checks).toHaveProperty('allbridge');
  });
});
