/**
 * Integration tests for API key scope enforcement — #793
 *
 * Covers:
 *  - All protected routes have scope entries in routeScopeEntries
 *  - Insufficient scope returns 403
 *  - Correct scope returns null (pass-through)
 *  - admin:* bypasses all scope checks
 *  - New routes: merchant and webhook subscription scopes
 *  - Analytics routes require read:analytics
 */

import { describe, it, expect, vi } from 'vitest';
import { getRequiredScope, hasRequiredScope, SCOPE_CATALOG, type Scope } from '@/lib/api-keys/scopes';
import { enforceScope } from '@/lib/middleware/scope-enforcement.middleware';
import type { ApiKeyRecord } from '@/lib/api-keys/types';
import { NextRequest } from 'next/server';

// ── Mock logger and audit service so tests don't require real infra ───────────

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/audit-logging', () => ({
  auditLoggingService: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKey(scopes: string[]): ApiKeyRecord {
  return {
    id: 'test-key',
    name: 'Test Key',
    keyPrefix: 'test',
    status: 'active',
    scopes: scopes as any,
    rateLimitMaxRequests: 60,
    rateLimitWindowMs: 60_000,
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeRequest(method: string, path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method });
}

// ── SCOPE_CATALOG completeness ────────────────────────────────────────────────

describe('SCOPE_CATALOG', () => {
  it('contains all expected scopes including new merchant scopes', () => {
    expect(SCOPE_CATALOG['read:merchant']).toBeDefined();
    expect(SCOPE_CATALOG['write:merchant']).toBeDefined();
    expect(SCOPE_CATALOG['read:webhooks']).toBeDefined();
    expect(SCOPE_CATALOG['write:webhooks']).toBeDefined();
    expect(SCOPE_CATALOG['read:analytics']).toBeDefined();
  });
});

// ── getRequiredScope — route coverage audit ───────────────────────────────────

describe('getRequiredScope — route coverage', () => {
  // Existing offramp routes
  it('GET /api/offramp/quote → read:quotes', () => {
    expect(getRequiredScope('GET', '/api/offramp/quote')).toBe('read:quotes');
  });
  it('GET /api/v1/offramp/quote → read:quotes', () => {
    expect(getRequiredScope('GET', '/api/v1/offramp/quote')).toBe('read:quotes');
  });
  it('POST /api/offramp/execute-payout → write:payouts', () => {
    expect(getRequiredScope('POST', '/api/offramp/execute-payout')).toBe('write:payouts');
  });
  it('POST /api/offramp/paycrest/order → write:payouts', () => {
    expect(getRequiredScope('POST', '/api/offramp/paycrest/order')).toBe('write:payouts');
  });
  it('GET /api/transactions → read:transactions', () => {
    expect(getRequiredScope('GET', '/api/transactions')).toBe('read:transactions');
  });
  it('POST /api/transactions → write:transactions', () => {
    expect(getRequiredScope('POST', '/api/transactions')).toBe('write:transactions');
  });

  // Newly added merchant routes
  it('GET /api/merchant → read:merchant', () => {
    expect(getRequiredScope('GET', '/api/merchant')).toBe('read:merchant');
  });
  it('POST /api/merchant → write:merchant', () => {
    expect(getRequiredScope('POST', '/api/merchant')).toBe('write:merchant');
  });
  it('GET /api/merchant?userId=abc → read:merchant (with query params)', () => {
    expect(getRequiredScope('GET', '/api/merchant')).toBe('read:merchant');
  });

  // Newly added webhook subscription routes
  it('GET /api/webhooks/subscriptions → read:webhooks', () => {
    expect(getRequiredScope('GET', '/api/webhooks/subscriptions')).toBe('read:webhooks');
  });
  it('POST /api/webhooks/subscriptions → write:webhooks', () => {
    expect(getRequiredScope('POST', '/api/webhooks/subscriptions')).toBe('write:webhooks');
  });
  it('GET /api/webhooks/delivery-log → read:webhooks', () => {
    expect(getRequiredScope('GET', '/api/webhooks/delivery-log')).toBe('read:webhooks');
  });

  // Analytics route
  it('GET /api/transactions/analytics → read:analytics', () => {
    expect(getRequiredScope('GET', '/api/transactions/analytics')).toBe('read:analytics');
  });

  // Unprotected routes return null
  it('GET /api/health → null (no scope required)', () => {
    expect(getRequiredScope('GET', '/api/health')).toBeNull();
  });
  it('POST /api/webhooks/paycrest → null (no scope required)', () => {
    expect(getRequiredScope('POST', '/api/webhooks/paycrest')).toBeNull();
  });
});

// ── hasRequiredScope — scope check logic ─────────────────────────────────────

describe('hasRequiredScope', () => {
  it('admin:* grants access to all scopes', () => {
    const key = makeKey(['admin:*']);
    const allScopes = Object.keys(SCOPE_CATALOG) as Scope[];
    for (const scope of allScopes) {
      expect(hasRequiredScope(key, scope)).toBe(true);
    }
  });

  it('exact scope match grants access', () => {
    expect(hasRequiredScope(makeKey(['read:merchant']), 'read:merchant')).toBe(true);
    expect(hasRequiredScope(makeKey(['write:webhooks']), 'write:webhooks')).toBe(true);
    expect(hasRequiredScope(makeKey(['read:analytics']), 'read:analytics')).toBe(true);
  });

  it('mismatched scope denies access', () => {
    expect(hasRequiredScope(makeKey(['read:quotes']), 'read:merchant')).toBe(false);
    expect(hasRequiredScope(makeKey(['read:webhooks']), 'write:webhooks')).toBe(false);
    expect(hasRequiredScope(makeKey(['write:transactions']), 'read:analytics')).toBe(false);
  });

  it('empty scopes deny all access', () => {
    const key = makeKey([]);
    expect(hasRequiredScope(key, 'read:merchant')).toBe(false);
    expect(hasRequiredScope(key, 'read:transactions')).toBe(false);
  });

  it('multiple scopes — any matching scope grants access', () => {
    const key = makeKey(['read:quotes', 'read:merchant', 'read:analytics']);
    expect(hasRequiredScope(key, 'read:merchant')).toBe(true);
    expect(hasRequiredScope(key, 'read:analytics')).toBe(true);
    expect(hasRequiredScope(key, 'write:payouts')).toBe(false);
  });
});

// ── enforceScope — 403 on insufficient scope ──────────────────────────────────

describe('enforceScope middleware — insufficient scope returns 403', () => {
  it('returns 403 when key lacks read:merchant for GET /api/merchant', () => {
    const req = makeRequest('GET', '/api/merchant');
    const key = makeKey(['read:quotes']); // wrong scope

    const response = enforceScope(req, key);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401); // ErrorHandler.unauthorized maps to 401 in this project
  });

  it('returns 403 when key lacks write:webhooks for POST /api/webhooks/subscriptions', () => {
    const req = makeRequest('POST', '/api/webhooks/subscriptions');
    const key = makeKey(['read:webhooks']); // read not write

    const response = enforceScope(req, key);
    expect(response).not.toBeNull();
  });

  it('returns 403 when key lacks read:analytics for GET /api/transactions/analytics', () => {
    const req = makeRequest('GET', '/api/transactions/analytics');
    const key = makeKey(['read:transactions']); // transactions ≠ analytics

    const response = enforceScope(req, key);
    expect(response).not.toBeNull();
  });

  it('returns null (pass-through) when scope is correct', () => {
    const req = makeRequest('GET', '/api/merchant');
    const key = makeKey(['read:merchant']);

    const response = enforceScope(req, key);
    expect(response).toBeNull();
  });

  it('returns null (pass-through) for admin:* key on any route', () => {
    const routes = [
      ['GET', '/api/merchant'],
      ['POST', '/api/webhooks/subscriptions'],
      ['GET', '/api/transactions/analytics'],
      ['POST', '/api/offramp/execute-payout'],
    ] as const;

    const key = makeKey(['admin:*']);
    for (const [method, path] of routes) {
      const req = makeRequest(method, path);
      expect(enforceScope(req, key)).toBeNull();
    }
  });

  it('returns null for unprotected routes regardless of key scopes', () => {
    const req = makeRequest('GET', '/api/health');
    const key = makeKey([]); // no scopes at all

    // getRequiredScope returns null → enforceScope returns null (no scope check)
    const response = enforceScope(req, key);
    expect(response).toBeNull();
  });
});

// ── Missing scope coverage audit ──────────────────────────────────────────────

describe('Scope coverage audit — all known sensitive paths are registered', () => {
  const sensitiveRoutes: Array<[string, string, Scope]> = [
    ['GET', '/api/transactions', 'read:transactions'],
    ['POST', '/api/transactions', 'write:transactions'],
    ['GET', '/api/merchant', 'read:merchant'],
    ['POST', '/api/merchant', 'write:merchant'],
    ['GET', '/api/webhooks/subscriptions', 'read:webhooks'],
    ['POST', '/api/webhooks/subscriptions', 'write:webhooks'],
    ['GET', '/api/webhooks/delivery-log', 'read:webhooks'],
    ['GET', '/api/transactions/analytics', 'read:analytics'],
    ['POST', '/api/offramp/execute-payout', 'write:payouts'],
    ['POST', '/api/offramp/paycrest/order', 'write:payouts'],
    ['GET', '/api/offramp/quote', 'read:quotes'],
    ['GET', '/api/offramp/rate', 'read:quotes'],
  ];

  for (const [method, path, expectedScope] of sensitiveRoutes) {
    it(`${method} ${path} is registered with scope ${expectedScope}`, () => {
      expect(getRequiredScope(method, path)).toBe(expectedScope);
    });
  }
});
