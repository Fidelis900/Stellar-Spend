/**
 * Integration tests for the reconciliation pipeline.
 *
 * Covers:
 *  - POST /api/offramp/reconciliation  (report generation)
 *  - POST /api/offramp/reconciliation/alerts  (mismatch detection & alert generation)
 *  - POST /api/offramp/reconciliation/manual  (manual resolution path)
 *  - GET  /api/offramp/reconciliation/manual  (history retrieval)
 *
 * Fixtures:
 *  - matched:   all three legs (stellar / base / paycrest) agree
 *  - unmatched: stellar hash missing / amount differs
 *  - pending:   paycrest order in pending state (unsettled)
 *
 * The db and fetch calls are mocked so the suite runs deterministically in CI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── DB mock ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  db: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

// ── Logger mock ───────────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withContext: vi.fn().mockReturnThis(),
  },
}));

// ── Env mock ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/env', () => ({
  env: {
    server: {
      STELLAR_HORIZON_URL: 'https://horizon.test',
      BASE_RPC_URL: 'https://base-rpc.test',
      PAYCREST_API_KEY: 'test-key',
    },
  },
}));

import { POST as reconciliationPost } from '@/app/api/offramp/reconciliation/route';
import { POST as alertsPost } from '@/app/api/offramp/reconciliation/alerts/route';
import { POST as manualPost, GET as manualGet } from '@/app/api/offramp/reconciliation/manual/route';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MATCHED_RECORD = {
  transactionId: 'tx-matched-001',
  stellarTxHash: 'stellar-ok-hash',
  baseTxHash: '0xbase-ok-hash',
  paycrestOrderId: 'order-matched-001',
  amount: '100.00',
  currency: 'USDC',
  timestamp: '2026-06-01T12:00:00.000Z',
};

const UNMATCHED_RECORD_MISSING_STELLAR = {
  transactionId: 'tx-unmatched-001',
  // stellarTxHash intentionally omitted
  baseTxHash: '0xbase-hash-002',
  paycrestOrderId: 'order-002',
  amount: '50.00',
  currency: 'USDC',
  timestamp: '2026-06-01T13:00:00.000Z',
};

const UNMATCHED_RECORD_AMOUNT_MISMATCH = {
  transactionId: 'tx-unmatched-002',
  stellarTxHash: 'stellar-mismatch-hash',
  baseTxHash: '0xbase-mismatch-hash',
  paycrestOrderId: 'order-mismatch-002',
  amount: '75.00',
  currency: 'USDC',
  timestamp: '2026-06-01T14:00:00.000Z',
};

const PENDING_SETTLEMENT_RECORD = {
  transactionId: 'tx-pending-001',
  stellarTxHash: 'stellar-pending-hash',
  baseTxHash: '0xbase-pending-hash',
  paycrestOrderId: 'order-pending-001',
  amount: '200.00',
  currency: 'USDC',
  timestamp: '2026-06-01T15:00:00.000Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/offramp/reconciliation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Mock fetch to control what each external leg returns
function mockFetchAllOk(amount = '100.00') {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ successful: true }) })   // Stellar
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { hash: '0xok' } }) }) // Base
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'completed', amount } }) }); // Paycrest
}

function mockFetchAllFail() {
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
}

function mockFetchPendingPaycrest(amount = '200.00') {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ successful: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { hash: '0xpending' } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'pending', amount } }) });
}

function mockFetchAmountMismatch() {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ successful: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { hash: '0xmismatch' } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'completed', amount: '999.00' } }) });
}

// ── POST /api/offramp/reconciliation ─────────────────────────────────────────

describe('POST /api/offramp/reconciliation — report generation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns 400 when records array is missing', async () => {
    const req = makeRequest({ format: 'json' });
    const res = await reconciliationPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/records/i);
  });

  it('returns 400 when records array is empty', async () => {
    const req = makeRequest({ records: [] });
    const res = await reconciliationPost(req);
    expect(res.status).toBe(400);
  });

  it('generates a report for matched fixture — zero discrepancies', async () => {
    mockFetchAllOk('100.00');
    const req = makeRequest({ records: [MATCHED_RECORD] });
    const res = await reconciliationPost(req);
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.totalTransactions).toBe(1);
    expect(report.discrepancies.length).toBe(0);
    expect(report.matchedTransactions).toBe(1);
  });

  it('detects discrepancy for record missing stellar hash', async () => {
    mockFetchAllFail();
    const req = makeRequest({ records: [UNMATCHED_RECORD_MISSING_STELLAR] });
    const res = await reconciliationPost(req);
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.totalTransactions).toBe(1);
    expect(report.discrepancies.length).toBeGreaterThan(0);
  });

  it('detects amount mismatch discrepancy', async () => {
    mockFetchAmountMismatch();
    const req = makeRequest({ records: [UNMATCHED_RECORD_AMOUNT_MISMATCH] });
    const res = await reconciliationPost(req);
    const report = await res.json();
    expect(report.discrepancies.some((d: any) => d.type === 'amount_mismatch')).toBe(true);
  });

  it('detects unsettled order for pending settlement fixture', async () => {
    mockFetchPendingPaycrest();
    const req = makeRequest({ records: [PENDING_SETTLEMENT_RECORD] });
    const res = await reconciliationPost(req);
    const report = await res.json();
    expect(report.discrepancies.some((d: any) => d.type === 'unsettled_order')).toBe(true);
    expect(report.summary.unsettledOrders).toBeGreaterThan(0);
  });

  it('produces CSV when format=csv', async () => {
    mockFetchAllFail();
    const req = makeRequest({ records: [UNMATCHED_RECORD_MISSING_STELLAR], format: 'csv' });
    const res = await reconciliationPost(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('Transaction ID');
    expect(text).toContain(UNMATCHED_RECORD_MISSING_STELLAR.transactionId);
  });

  it('produces a daily report when format=daily', async () => {
    mockFetchAllFail();
    const req = makeRequest({ records: [MATCHED_RECORD, PENDING_SETTLEMENT_RECORD], format: 'daily' });
    const res = await reconciliationPost(req);
    expect(res.status).toBe(200);
    const daily = await res.json();
    expect(daily.totalCount).toBe(2);
    expect(daily.date).toBeDefined();
  });

  it('processes multiple mixed records in one run', async () => {
    // Call fetch enough times for 3 records × 3 external calls each (9 calls)
    global.fetch = vi.fn()
      // matched record — all OK
      .mockResolvedValueOnce({ ok: true, json: async () => ({ successful: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { hash: '0xa' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'completed', amount: '100.00' } }) })
      // unmatched — all fail
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      // pending
      .mockResolvedValueOnce({ ok: true, json: async () => ({ successful: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { hash: '0xb' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'pending', amount: '200.00' } }) });

    const req = makeRequest({
      records: [MATCHED_RECORD, UNMATCHED_RECORD_MISSING_STELLAR, PENDING_SETTLEMENT_RECORD],
    });
    const res = await reconciliationPost(req);
    const report = await res.json();
    expect(report.totalTransactions).toBe(3);
    // At least the unmatched and pending records introduce discrepancies
    expect(report.discrepancies.length).toBeGreaterThan(0);
  });
});

// ── POST /api/offramp/reconciliation/alerts ───────────────────────────────────

describe('POST /api/offramp/reconciliation/alerts — mismatch detection & alert generation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns 400 when records are missing', async () => {
    const req = new NextRequest('http://localhost/api/offramp/reconciliation/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await alertsPost(req);
    expect(res.status).toBe(400);
  });

  it('returns alerts for unmatched records', async () => {
    mockFetchAllFail();
    const req = new NextRequest('http://localhost/api/offramp/reconciliation/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [UNMATCHED_RECORD_MISSING_STELLAR, UNMATCHED_RECORD_AMOUNT_MISMATCH],
      }),
    });
    const res = await alertsPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.summary).toBeDefined();
  });

  it('generates high-severity alert when many records are missing Stellar tx', async () => {
    // 10 records all failing Stellar lookup
    const records = Array.from({ length: 10 }, (_, i) => ({
      ...UNMATCHED_RECORD_MISSING_STELLAR,
      transactionId: `tx-bulk-${i}`,
      paycrestOrderId: `order-bulk-${i}`,
    }));
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const req = new NextRequest('http://localhost/api/offramp/reconciliation/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    const res = await alertsPost(req);
    const body = await res.json();
    expect(body.alerts.some((a: any) => a.severity === 'high')).toBe(true);
  });

  it('includes optional daily report when includeDaily=true', async () => {
    mockFetchAllFail();
    const req = new NextRequest('http://localhost/api/offramp/reconciliation/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [MATCHED_RECORD], includeDaily: true }),
    });
    const res = await alertsPost(req);
    const body = await res.json();
    expect(body.daily).toBeDefined();
  });
});

// ── POST /api/offramp/reconciliation/manual — resolution path ─────────────────

describe('POST /api/offramp/reconciliation/manual — manual resolution', () => {
  beforeEach(() => vi.restoreAllMocks());

  function makeManualRequest(body: unknown) {
    return new NextRequest('http://localhost/api/offramp/reconciliation/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 400 when transactionId is missing', async () => {
    const req = makeManualRequest({ action: 'retry' });
    const res = await manualPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/transactionId/i);
  });

  it('returns 400 for an invalid action value', async () => {
    const req = makeManualRequest({ transactionId: 'tx-1', action: 'delete_everything' });
    const res = await manualPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/action/i);
  });

  it('handles retry action successfully', async () => {
    const req = makeManualRequest({
      transactionId: 'tx-manual-retry',
      action: 'retry',
      notes: 'User requested retry',
      resolvedBy: 'admin@example.com',
    });
    const res = await manualPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('handles mark_resolved action successfully', async () => {
    const req = makeManualRequest({
      transactionId: 'tx-manual-resolved',
      action: 'mark_resolved',
      resolvedBy: 'ops-team',
    });
    const res = await manualPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('handles investigate action successfully', async () => {
    const req = makeManualRequest({
      transactionId: 'tx-manual-investigate',
      action: 'investigate',
      notes: 'Flagged for manual review',
    });
    const res = await manualPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBeDefined();
  });
});

// ── GET /api/offramp/reconciliation/manual — history ─────────────────────────

describe('GET /api/offramp/reconciliation/manual — reconciliation history', () => {
  it('returns history array', async () => {
    const res = await manualGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('history');
    expect(Array.isArray(body.history)).toBe(true);
  });
});
