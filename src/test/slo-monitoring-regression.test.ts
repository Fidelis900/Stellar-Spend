/**
 * #843 – SLO / Monitoring endpoint regression tests
 *
 * Ensures that:
 *  - GET /api/slo/status returns the expected dashboard shape so that canary
 *    promotion automation and external dashboards never silently break.
 *  - GET /api/monitoring/dashboard returns all top-level keys dashboards rely on.
 *  - POST /api/monitoring/vitals accepts both Web-Vitals payloads and funnel
 *    events, and rejects invalid payloads.
 *  - GET /api/monitoring/cache returns the required metric keys in every
 *    response.
 *
 * All external dependencies (fetch, performanceMonitor, monitoring libs, cache)
 * are stubbed so the tests run in the unit/integration test environment without
 * a live database or network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks – must be declared before the route imports
// ---------------------------------------------------------------------------

// ── SLO status route ─────────────────────────────────────────────────────────

const mockGetDashboardData = vi.fn(() => ({
  slos: [
    {
      name: 'api-availability',
      objective: 0.999,
      current_value: 0.9995,
      error_budget_remaining: 0.995,
      burn_rate: 0.5,
      status: 'healthy',
    },
    {
      name: 'payout-success-rate',
      objective: 0.995,
      current_value: 0.994,
      error_budget_remaining: 0.8,
      burn_rate: 1.2,
      status: 'warning',
    },
  ],
  summary: { healthy: 1, warning: 1, critical: 0, total: 2 },
}));

vi.mock('@/lib/performance-monitoring', () => ({
  performanceMonitor: { getDashboardData: mockGetDashboardData },
  sloConfig: [],
}));

// ── Monitoring dashboard route ───────────────────────────────────────────────

const mockGetDashboardMetrics = vi.fn(() => ({ uptime: 99.9, requestCount: 1000 }));
const mockRecordUptimeCheck = vi.fn();
const mockGetTransactionQueue = vi.fn(() => ({
  getMetrics: vi.fn(() => ({ pending: 5, processing: 2, failed: 0 })),
}));
const mockGetTransactionAnalytics = vi.fn(async () => ({
  total: 200,
  succeeded: 195,
  failed: 5,
}));
const mockGetApiMetrics = vi.fn(() => ({ p50: 120, p95: 450, p99: 900 }));
const mockGetDbMetrics = vi.fn(() => ({ p50: 20, p95: 80, p99: 200 }));
const mockGetVitalsMetrics = vi.fn(() => ({ LCP: 1800, FID: 50, CLS: 0.05 }));
const mockGetPerfAlerts = vi.fn(() => []);

vi.mock('@/lib/monitoring', () => ({
  getDashboardMetrics: mockGetDashboardMetrics,
  recordUptimeCheck: mockRecordUptimeCheck,
}));

vi.mock('@/lib/priority-queue', () => ({
  getTransactionQueue: mockGetTransactionQueue,
}));

vi.mock('@/lib/transaction-analytics', () => ({
  getTransactionAnalytics: mockGetTransactionAnalytics,
}));

vi.mock('@/lib/performance', () => ({
  getApiMetrics: mockGetApiMetrics,
  getDbMetrics: mockGetDbMetrics,
  getVitalsMetrics: mockGetVitalsMetrics,
  getPerfAlerts: mockGetPerfAlerts,
  recordVital: vi.fn(),
  recordFunnelEvent: vi.fn(),
}));

// ── Cache monitoring route ───────────────────────────────────────────────────

const mockCacheGetMetrics = vi.fn(() => ({
  hits: 800,
  misses: 200,
  sets: 1000,
  errors: 2,
  hitRate: 0.8,
}));
const mockCacheHealthCheck = vi.fn(async () => true);
const mockCacheClear = vi.fn(async () => undefined);
const mockCacheResetMetrics = vi.fn();

vi.mock('@/lib/cache', () => ({
  cache: {
    getMetrics: mockCacheGetMetrics,
    healthCheck: mockCacheHealthCheck,
    clear: mockCacheClear,
    resetMetrics: mockCacheResetMetrics,
  },
}));

vi.mock('@/lib/cache/warming', () => ({
  warmAllCaches: vi.fn(async () => undefined),
}));

vi.mock('@/lib/error-handler', () => ({
  ErrorHandler: {
    serverError: vi.fn(
      (err) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
    ),
    validation: vi.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 400 })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Stub fetch used by the monitoring dashboard health-ping
global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------

import { GET as sloStatusGET } from '@/app/api/slo/status/route';
import { GET as monDashGET } from '@/app/api/monitoring/dashboard/route';
import { POST as monVitalsPOST } from '@/app/api/monitoring/vitals/route';
import {
  GET as monCacheGET,
  POST as monCachePOST,
  DELETE as monCacheDELETE,
} from '@/app/api/monitoring/cache/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SLO / Monitoring endpoint regression tests (#843)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch stub to healthy response
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
  });

  // ── GET /api/slo/status ────────────────────────────────────────────────────

  describe('GET /api/slo/status', () => {
    it('returns HTTP 200', async () => {
      const res = await sloStatusGET();
      expect(res.status).toBe(200);
    });

    it('returns a body with top-level slos array and summary object', async () => {
      const res = await sloStatusGET();
      const body = await res.json();
      expect(body).toHaveProperty('slos');
      expect(body).toHaveProperty('summary');
      expect(Array.isArray(body.slos)).toBe(true);
    });

    it('each SLO entry has the required schema fields', async () => {
      const res = await sloStatusGET();
      const { slos } = await res.json();
      for (const slo of slos) {
        expect(slo).toHaveProperty('name');
        expect(slo).toHaveProperty('objective');
        expect(slo).toHaveProperty('current_value');
        expect(slo).toHaveProperty('error_budget_remaining');
        expect(slo).toHaveProperty('burn_rate');
        expect(slo).toHaveProperty('status');
        expect(['healthy', 'warning', 'critical']).toContain(slo.status);
      }
    });

    it('summary contains healthy / warning / critical / total counts', async () => {
      const res = await sloStatusGET();
      const { summary } = await res.json();
      expect(typeof summary.healthy).toBe('number');
      expect(typeof summary.warning).toBe('number');
      expect(typeof summary.critical).toBe('number');
      expect(typeof summary.total).toBe('number');
      expect(summary.healthy + summary.warning + summary.critical).toBeLessThanOrEqual(
        summary.total,
      );
    });

    it('delegates to performanceMonitor.getDashboardData()', async () => {
      await sloStatusGET();
      expect(mockGetDashboardData).toHaveBeenCalledOnce();
    });

    it('returns a warning SLO when burn rate is elevated', async () => {
      const res = await sloStatusGET();
      const { slos } = await res.json();
      const warningSlo = slos.find((s: { status: string }) => s.status === 'warning');
      expect(warningSlo).toBeDefined();
      expect(warningSlo.burn_rate).toBeGreaterThan(1);
    });
  });

  // ── GET /api/monitoring/dashboard ─────────────────────────────────────────

  describe('GET /api/monitoring/dashboard', () => {
    it('returns HTTP 200', async () => {
      const res = await monDashGET();
      expect(res.status).toBe(200);
    });

    it('response body contains ok: true', async () => {
      const res = await monDashGET();
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('response contains monitoring, queue, transactions, and performance keys', async () => {
      const res = await monDashGET();
      const body = await res.json();
      expect(body).toHaveProperty('monitoring');
      expect(body).toHaveProperty('queue');
      expect(body).toHaveProperty('transactions');
      expect(body).toHaveProperty('performance');
    });

    it('performance sub-object contains api, db, vitals, and alerts keys', async () => {
      const res = await monDashGET();
      const { performance } = await res.json();
      expect(performance).toHaveProperty('api');
      expect(performance).toHaveProperty('db');
      expect(performance).toHaveProperty('vitals');
      expect(performance).toHaveProperty('alerts');
    });

    it('records an uptime check regardless of health endpoint outcome', async () => {
      await monDashGET();
      expect(mockRecordUptimeCheck).toHaveBeenCalledOnce();
    });

    it('records uptime as false when health endpoint is down', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('connection refused'),
      );
      await monDashGET();
      expect(mockRecordUptimeCheck).toHaveBeenCalledWith(false, expect.any(Number));
    });

    it('records uptime as false when health returns non-ok status', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 }),
      );
      await monDashGET();
      expect(mockRecordUptimeCheck).toHaveBeenCalledWith(false, expect.any(Number));
    });
  });

  // ── POST /api/monitoring/vitals ────────────────────────────────────────────

  describe('POST /api/monitoring/vitals', () => {
    it('returns 204 for a valid Web Vitals payload', async () => {
      const res = await monVitalsPOST(
        makeRequest('/api/monitoring/vitals', 'POST', {
          name: 'LCP',
          value: 1800,
          rating: 'good',
          url: '/dashboard',
          ts: Date.now(),
        }),
      );
      expect(res.status).toBe(204);
    });

    it('returns 204 for a Funnel analytics event payload', async () => {
      const res = await monVitalsPOST(
        makeRequest('/api/monitoring/vitals', 'POST', {
          category: 'Funnel',
          action: 'quote_viewed',
          sessionId: 'sess_abc123',
          timestamp: new Date().toISOString(),
        }),
      );
      expect(res.status).toBe(204);
    });

    it('returns 204 for a generic analytics event (non-Funnel category)', async () => {
      const res = await monVitalsPOST(
        makeRequest('/api/monitoring/vitals', 'POST', {
          category: 'UI',
          action: 'button_click',
        }),
      );
      expect(res.status).toBe(204);
    });

    it('returns 400 for a payload missing both name+value and category+action', async () => {
      const res = await monVitalsPOST(
        makeRequest('/api/monitoring/vitals', 'POST', { foo: 'bar' }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when value is not a number in a Web Vitals payload', async () => {
      const res = await monVitalsPOST(
        makeRequest('/api/monitoring/vitals', 'POST', {
          name: 'FID',
          value: 'fast', // wrong type
        }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for malformed JSON (invalid body)', async () => {
      const req = new NextRequest('http://localhost/api/monitoring/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json',
      });
      const res = await monVitalsPOST(req);
      expect(res.status).toBe(400);
    });

    it('accepts Web Vitals payload with minimal fields (no rating / url / ts)', async () => {
      const res = await monVitalsPOST(
        makeRequest('/api/monitoring/vitals', 'POST', { name: 'CLS', value: 0.03 }),
      );
      expect(res.status).toBe(204);
    });
  });

  // ── GET /api/monitoring/cache ──────────────────────────────────────────────

  describe('GET /api/monitoring/cache', () => {
    it('returns HTTP 200', async () => {
      const res = await monCacheGET();
      expect(res.status).toBe(200);
    });

    it('response body contains status, metrics, and timestamp', async () => {
      const res = await monCacheGET();
      const body = await res.json();
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('metrics');
      expect(body).toHaveProperty('timestamp');
    });

    it('metrics contains hits, misses, sets, errors, and hitRate', async () => {
      const res = await monCacheGET();
      const { metrics } = await res.json();
      expect(metrics).toHaveProperty('hits');
      expect(metrics).toHaveProperty('misses');
      expect(metrics).toHaveProperty('sets');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('hitRate');
    });

    it('status is "healthy" when cache healthCheck returns true', async () => {
      const res = await monCacheGET();
      const body = await res.json();
      expect(body.status).toBe('healthy');
    });

    it('status is "degraded" when cache healthCheck returns false', async () => {
      mockCacheHealthCheck.mockResolvedValueOnce(false);
      const res = await monCacheGET();
      const body = await res.json();
      expect(body.status).toBe('degraded');
    });

    it('timestamp is a valid ISO-8601 string', async () => {
      const res = await monCacheGET();
      const { timestamp } = await res.json();
      expect(() => new Date(timestamp).toISOString()).not.toThrow();
    });
  });

  // ── POST /api/monitoring/cache (cache warming) ─────────────────────────────

  describe('POST /api/monitoring/cache', () => {
    it('returns HTTP 200 on success', async () => {
      const res = await monCachePOST();
      expect(res.status).toBe(200);
    });

    it('response contains success: true', async () => {
      const res = await monCachePOST();
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ── DELETE /api/monitoring/cache (cache clear) ─────────────────────────────

  describe('DELETE /api/monitoring/cache', () => {
    it('returns HTTP 200 on success', async () => {
      const res = await monCacheDELETE();
      expect(res.status).toBe(200);
    });

    it('response contains success: true', async () => {
      const res = await monCacheDELETE();
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('calls cache.clear() and cache.resetMetrics()', async () => {
      await monCacheDELETE();
      expect(mockCacheClear).toHaveBeenCalledOnce();
      expect(mockCacheResetMetrics).toHaveBeenCalledOnce();
    });
  });
});
