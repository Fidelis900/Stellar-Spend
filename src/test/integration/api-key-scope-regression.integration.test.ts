/**
 * Parametrized API key scope enforcement regression suite — #853
 *
 * Purpose
 * ───────
 * Every protected API endpoint MUST reject requests with an API key that lacks
 * the required scope, and MUST allow requests with the correct scope.  This
 * suite acts as a regression guard: adding a new endpoint requires adding an
 * entry to `PROTECTED_ENDPOINTS` below.  That requirement is documented in the
 * PR template checklist (see .github/PULL_REQUEST_TEMPLATE.md).
 *
 * How to add a new endpoint
 * ─────────────────────────
 * 1. Add an entry to the `PROTECTED_ENDPOINTS` table in this file.
 * 2. Verify the endpoint's route scope is registered in
 *    `src/lib/api-keys/scopes.ts` → `routeScopeEntries`.
 * 3. Check the "New protected endpoint" box in your PR checklist.
 *
 * The parametrized tests will automatically cover the new entry.
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getRequiredScope,
  hasRequiredScope,
  SCOPE_CATALOG,
  type Scope,
} from '@/lib/api-keys';
import { enforceScope } from '@/lib/middleware';
import type { ApiKeyRecord } from '@/lib/api-keys/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/audit-logging', () => ({
  auditLoggingService: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

// ── PROTECTED ENDPOINTS REGISTRY ──────────────────────────────────────────────
//
// Each entry encodes:
//   method         — HTTP verb
//   path           — full URL path (no query string)
//   requiredScope  — the scope enforced by the middleware
//   sufficientKey  — a key that MUST pass the check
//   insufficientKey — a key that MUST be rejected
//
// Keep this list in sync with `routeScopeEntries` in scopes.ts.
// When adding a new protected endpoint, add a row here AND check the PR
// template box "New protected endpoint added to scope regression suite".

type EndpointEntry = {
  method: string;
  path: string;
  requiredScope: Scope;
  insufficientScopes: string[];
};

const PROTECTED_ENDPOINTS: EndpointEntry[] = [
  // ── Quote / FX ──────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/offramp/quote',
    requiredScope: 'read:quotes',
    insufficientScopes: ['read:transactions', 'write:payouts', 'read:analytics'],
  },
  {
    method: 'GET',
    path: '/api/v1/offramp/quote',
    requiredScope: 'read:quotes',
    insufficientScopes: ['write:transactions'],
  },
  {
    method: 'GET',
    path: '/api/offramp/rate',
    requiredScope: 'read:quotes',
    insufficientScopes: ['read:transactions'],
  },
  {
    method: 'GET',
    path: '/api/v1/offramp/rate',
    requiredScope: 'read:quotes',
    insufficientScopes: ['read:transactions'],
  },
  {
    method: 'GET',
    path: '/api/offramp/fees',
    requiredScope: 'read:quotes',
    insufficientScopes: ['write:payouts'],
  },
  {
    method: 'GET',
    path: '/api/offramp/currencies',
    requiredScope: 'read:quotes',
    insufficientScopes: ['read:transactions'],
  },
  {
    method: 'GET',
    path: '/api/offramp/institutions/NGN',
    requiredScope: 'read:quotes',
    insufficientScopes: ['write:transactions'],
  },
  {
    method: 'GET',
    path: '/api/offramp/verify-account',
    requiredScope: 'read:quotes',
    insufficientScopes: ['read:transactions'],
  },
  {
    method: 'GET',
    path: '/api/fx-rates',
    requiredScope: 'read:quotes',
    insufficientScopes: ['read:transactions'],
  },

  // ── Payouts ──────────────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/api/offramp/execute-payout',
    requiredScope: 'write:payouts',
    insufficientScopes: ['read:quotes', 'read:transactions', 'write:transactions'],
  },
  {
    method: 'POST',
    path: '/api/v1/offramp/execute-payout',
    requiredScope: 'write:payouts',
    insufficientScopes: ['read:quotes'],
  },
  {
    method: 'POST',
    path: '/api/offramp/paycrest/order',
    requiredScope: 'write:payouts',
    insufficientScopes: ['read:quotes', 'read:transactions'],
  },

  // ── Transactions ─────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/transactions',
    requiredScope: 'read:transactions',
    insufficientScopes: ['write:transactions', 'read:quotes', 'write:payouts'],
  },
  {
    method: 'POST',
    path: '/api/transactions',
    requiredScope: 'write:transactions',
    insufficientScopes: ['read:transactions', 'read:quotes'],
  },
  {
    method: 'GET',
    path: '/api/offramp/status/order-123',
    requiredScope: 'read:transactions',
    insufficientScopes: ['read:quotes', 'write:payouts'],
  },
  {
    method: 'GET',
    path: '/api/v1/offramp/reconciliation',
    requiredScope: 'read:transactions',
    insufficientScopes: ['read:quotes'],
  },

  // ── Analytics ────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/transactions/analytics',
    requiredScope: 'read:analytics',
    insufficientScopes: ['read:transactions', 'write:transactions', 'read:quotes'],
  },

  // ── Merchant ─────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/merchant',
    requiredScope: 'read:merchant',
    insufficientScopes: ['read:quotes', 'read:transactions', 'write:merchant'],
  },
  {
    method: 'POST',
    path: '/api/merchant',
    requiredScope: 'write:merchant',
    insufficientScopes: ['read:merchant', 'read:quotes', 'write:transactions'],
  },

  // ── Webhooks ─────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/webhooks/subscriptions',
    requiredScope: 'read:webhooks',
    insufficientScopes: ['write:webhooks', 'read:transactions'],
  },
  {
    method: 'POST',
    path: '/api/webhooks/subscriptions',
    requiredScope: 'write:webhooks',
    insufficientScopes: ['read:webhooks', 'read:transactions', 'write:transactions'],
  },
  {
    method: 'GET',
    path: '/api/webhooks/delivery-log',
    requiredScope: 'read:webhooks',
    insufficientScopes: ['write:webhooks', 'read:transactions'],
  },
];

// ── Unprotected routes that must NOT require any scope ────────────────────────

const UNPROTECTED_ENDPOINTS = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/webhooks/paycrest' },
  { method: 'GET', path: '/api/offramp/bridge/status/0xabc' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeKey(scopes: string[]): ApiKeyRecord {
  return {
    id: 'test-key-id',
    name: 'Test Key',
    keyPrefix: 'tst',
    status: 'active',
    scopes: scopes as ApiKeyRecord['scopes'],
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

// ── Test suites ────────────────────────────────────────────────────────────────

// ── 1. SCOPE_CATALOG completeness ────────────────────────────────────────────

describe('SCOPE_CATALOG completeness', () => {
  it('contains an entry for every scope used in PROTECTED_ENDPOINTS', () => {
    const requiredScopes = new Set(PROTECTED_ENDPOINTS.map((e) => e.requiredScope));
    for (const scope of requiredScopes) {
      expect(SCOPE_CATALOG, `Expected SCOPE_CATALOG to contain "${scope}"`).toHaveProperty(scope);
    }
  });

  it('admin:* is registered in SCOPE_CATALOG', () => {
    expect(SCOPE_CATALOG['admin:*']).toBeDefined();
  });
});

// ── 2. getRequiredScope — every endpoint is registered ───────────────────────

describe('getRequiredScope — all protected endpoints are registered in routeScopeEntries', () => {
  for (const endpoint of PROTECTED_ENDPOINTS) {
    it(`${endpoint.method} ${endpoint.path} → ${endpoint.requiredScope}`, () => {
      const scope = getRequiredScope(endpoint.method, endpoint.path);
      expect(scope).toBe(endpoint.requiredScope);
    });
  }

  for (const endpoint of UNPROTECTED_ENDPOINTS) {
    it(`${endpoint.method} ${endpoint.path} → null (unprotected)`, () => {
      expect(getRequiredScope(endpoint.method, endpoint.path)).toBeNull();
    });
  }
});

// ── 3. hasRequiredScope — scope check logic ───────────────────────────────────

describe('hasRequiredScope — correct/incorrect scope combinations', () => {
  for (const endpoint of PROTECTED_ENDPOINTS) {
    describe(`${endpoint.method} ${endpoint.path} (requires ${endpoint.requiredScope})`, () => {
      it('grants access with the exact required scope', () => {
        expect(hasRequiredScope(makeKey([endpoint.requiredScope]), endpoint.requiredScope)).toBe(
          true,
        );
      });

      it('grants access with admin:* regardless of endpoint', () => {
        expect(hasRequiredScope(makeKey(['admin:*']), endpoint.requiredScope)).toBe(true);
      });

      for (const badScope of endpoint.insufficientScopes) {
        it(`denies access with insufficient scope "${badScope}"`, () => {
          expect(hasRequiredScope(makeKey([badScope]), endpoint.requiredScope)).toBe(false);
        });
      }

      it('denies access with no scopes (empty array)', () => {
        expect(hasRequiredScope(makeKey([]), endpoint.requiredScope)).toBe(false);
      });
    });
  }
});

// ── 4. enforceScope middleware — 403 / pass-through ───────────────────────────

describe('enforceScope — parametrized 403/pass-through coverage', () => {
  for (const endpoint of PROTECTED_ENDPOINTS) {
    describe(`${endpoint.method} ${endpoint.path}`, () => {
      it('returns a non-null error response when key has wrong scope', () => {
        const req = makeRequest(endpoint.method, endpoint.path);
        const wrongKey = makeKey(endpoint.insufficientScopes.slice(0, 1));
        const response = enforceScope(req, wrongKey);
        expect(response).not.toBeNull();
        // The middleware returns an HTTP error (401 per ErrorHandler.unauthorized)
        expect(response!.status).toBeGreaterThanOrEqual(400);
      });

      it('returns null (pass-through) when key has exact required scope', () => {
        const req = makeRequest(endpoint.method, endpoint.path);
        const correctKey = makeKey([endpoint.requiredScope]);
        expect(enforceScope(req, correctKey)).toBeNull();
      });

      it('returns null (pass-through) when key has admin:*', () => {
        const req = makeRequest(endpoint.method, endpoint.path);
        const adminKey = makeKey(['admin:*']);
        expect(enforceScope(req, adminKey)).toBeNull();
      });
    });
  }

  for (const endpoint of UNPROTECTED_ENDPOINTS) {
    it(`${endpoint.method} ${endpoint.path} — always passes regardless of key scopes`, () => {
      const req = makeRequest(endpoint.method, endpoint.path);
      const noScopeKey = makeKey([]);
      expect(enforceScope(req, noScopeKey)).toBeNull();
    });
  }
});

// ── 5. Consistent error body ───────────────────────────────────────────────────

describe('Consistent 403 error body structure', () => {
  it('error response body contains a message referencing the missing scope', async () => {
    const req = makeRequest('GET', '/api/merchant');
    const wrongKey = makeKey(['read:quotes']);
    const response = enforceScope(req, wrongKey);

    expect(response).not.toBeNull();
    const body = await response!.json();

    // Body must carry an error message that mentions the scope
    const errorText = JSON.stringify(body);
    expect(errorText).toMatch(/read:merchant/i);
  });

  it('error response has the same shape across different endpoints', async () => {
    const cases: [string, string, string[]][] = [
      ['GET', '/api/merchant', ['read:quotes']],
      ['POST', '/api/webhooks/subscriptions', ['read:webhooks']],
      ['GET', '/api/transactions/analytics', ['read:transactions']],
    ];

    for (const [method, path, wrongScopes] of cases) {
      const req = makeRequest(method, path);
      const response = enforceScope(req, makeKey(wrongScopes));
      expect(response).not.toBeNull();

      const body = await response!.json();
      // The body must have at least one of: error, message (standard error envelope)
      const hasErrorField = 'error' in body || 'message' in body;
      expect(hasErrorField).toBe(true);
    }
  });
});

// ── 6. Multiple-scope keys ─────────────────────────────────────────────────────

describe('Multi-scope API keys', () => {
  it('a key with multiple scopes passes any endpoint whose scope is included', () => {
    const multiKey = makeKey([
      'read:quotes',
      'read:transactions',
      'write:payouts',
      'read:analytics',
      'read:merchant',
    ]);

    const endpoints: [string, string][] = [
      ['GET', '/api/offramp/quote'],
      ['GET', '/api/transactions'],
      ['POST', '/api/offramp/execute-payout'],
      ['GET', '/api/transactions/analytics'],
      ['GET', '/api/merchant'],
    ];

    for (const [method, path] of endpoints) {
      const req = makeRequest(method, path);
      expect(enforceScope(req, multiKey), `Expected pass for ${method} ${path}`).toBeNull();
    }
  });

  it('a key with multiple scopes is still rejected for endpoints NOT in its scope list', () => {
    const limitedKey = makeKey(['read:quotes', 'read:transactions']);

    const blockedEndpoints: [string, string][] = [
      ['POST', '/api/offramp/execute-payout'], // needs write:payouts
      ['POST', '/api/merchant'], // needs write:merchant
      ['POST', '/api/webhooks/subscriptions'], // needs write:webhooks
    ];

    for (const [method, path] of blockedEndpoints) {
      const req = makeRequest(method, path);
      expect(
        enforceScope(req, limitedKey),
        `Expected rejection for ${method} ${path}`,
      ).not.toBeNull();
    }
  });
});

// ── 7. Endpoint count smoke test (guard against accidental deletions) ────────

describe('Registry integrity', () => {
  it(`PROTECTED_ENDPOINTS contains at least ${PROTECTED_ENDPOINTS.length} entries`, () => {
    expect(PROTECTED_ENDPOINTS.length).toBeGreaterThanOrEqual(22);
  });

  it('every entry has a non-empty method, path, and requiredScope', () => {
    for (const entry of PROTECTED_ENDPOINTS) {
      expect(entry.method, `method is required`).toBeTruthy();
      expect(entry.path, `path is required`).toBeTruthy();
      expect(entry.requiredScope, `requiredScope is required`).toBeTruthy();
      expect(
        entry.insufficientScopes.length,
        `need at least one insufficient scope`,
      ).toBeGreaterThan(0);
    }
  });
});
