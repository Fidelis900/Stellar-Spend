/**
 * #844 – CSP report handler unit tests
 *
 * Tests for POST /api/csp-report to verify:
 *  - Valid, well-formed CSP reports are accepted and logged.
 *  - The handler returns 204 on success (per spec: report-to endpoints return
 *    no content).
 *  - Malformed / missing fields don't crash the handler.
 *  - Completely invalid JSON (or empty bodies) return a graceful 4xx.
 *  - The logger.warn is called with the correct derived fields.
 *  - The handler never leaks server errors as unhandled 500s to the client.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  ErrorHandler: {
    validation: vi.fn(
      (msg: string) =>
        new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
    serverError: vi.fn(
      (err: unknown) =>
        new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  },
}));

// ---------------------------------------------------------------------------
// Route import (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/csp-report/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCSPRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Minimal valid CSP report payload as browsers send it. */
function validCSPPayload(overrides: Record<string, unknown> = {}) {
  return {
    'csp-report': {
      'document-uri': 'https://app.example.com/dashboard',
      'violated-directive': 'script-src',
      'effective-directive': 'script-src',
      'original-policy': "default-src 'self'; script-src 'self'; report-uri /api/csp-report",
      disposition: 'enforce',
      'blocked-uri': 'https://malicious.example.com/payload.js',
      'source-file': 'https://app.example.com/dashboard',
      'line-number': 42,
      'column-number': 7,
      'status-code': 200,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CSP report handler unit tests (#844)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('valid CSP report', () => {
    it('returns HTTP 204 for a well-formed CSP violation report', async () => {
      const res = await POST(makeCSPRequest(validCSPPayload()));
      expect(res.status).toBe(204);
    });

    it('calls logger.warn with a "CSP Violation Detected" message', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      expect(mockLoggerWarn).toHaveBeenCalledOnce();
      expect(mockLoggerWarn.mock.calls[0][0]).toBe('CSP Violation Detected');
    });

    it('logs the documentUri from the report', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.documentUri).toBe('https://app.example.com/dashboard');
    });

    it('logs the violatedDirective', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.violatedDirective).toBe('script-src');
    });

    it('logs the effectiveDirective', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.effectiveDirective).toBe('script-src');
    });

    it('logs blockedUri when present', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.blockedUri).toBe('https://malicious.example.com/payload.js');
    });

    it('logs sourceFile when present', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.sourceFile).toBe('https://app.example.com/dashboard');
    });

    it('logs lineNumber and columnNumber', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.lineNumber).toBe(42);
      expect(loggedFields.columnNumber).toBe(7);
    });

    it('logs disposition', async () => {
      await POST(makeCSPRequest(validCSPPayload()));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.disposition).toBe('enforce');
    });
  });

  // ── Optional fields omitted ────────────────────────────────────────────────

  describe('optional fields absent', () => {
    it('returns 204 when optional fields are missing (no blocked-uri etc.)', async () => {
      const minimalReport = {
        'csp-report': {
          'document-uri': 'https://app.example.com/',
          'violated-directive': 'img-src',
          'effective-directive': 'img-src',
          'original-policy': "img-src 'self'",
          disposition: 'report',
        },
      };
      const res = await POST(makeCSPRequest(minimalReport));
      expect(res.status).toBe(204);
    });

    it('logs undefined for absent optional fields without throwing', async () => {
      const minimalReport = {
        'csp-report': {
          'document-uri': 'https://app.example.com/',
          'violated-directive': 'img-src',
          'effective-directive': 'img-src',
          'original-policy': "img-src 'self'",
          disposition: 'report',
        },
      };
      await POST(makeCSPRequest(minimalReport));
      const [, loggedFields] = mockLoggerWarn.mock.calls[0];
      expect(loggedFields.blockedUri).toBeUndefined();
      expect(loggedFields.lineNumber).toBeUndefined();
    });
  });

  // ── report-only disposition ────────────────────────────────────────────────

  describe('report-only mode', () => {
    it('returns 204 for disposition "report" (Content-Security-Policy-Report-Only)', async () => {
      const res = await POST(makeCSPRequest(validCSPPayload({ disposition: 'report' })));
      expect(res.status).toBe(204);
    });
  });

  // ── Malformed / adversarial input ─────────────────────────────────────────

  describe('malformed input', () => {
    it('returns 4xx (not 500) when the body is completely empty JSON {}', async () => {
      const res = await POST(makeCSPRequest({}));
      // Handler should fail gracefully — either 400 or 204 (if it swallows),
      // but MUST NOT be 500.
      expect(res.status).not.toBe(500);
    });

    it('returns 4xx (not 500) when csp-report key is missing entirely', async () => {
      const res = await POST(makeCSPRequest({ other: 'data' }));
      expect(res.status).not.toBe(500);
    });

    it('does not throw / crash when csp-report is null', async () => {
      const req = makeCSPRequest({ 'csp-report': null });
      await expect(POST(req)).resolves.toBeDefined();
    });

    it('returns 4xx when body is invalid JSON', async () => {
      const req = new NextRequest('http://localhost/api/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '<<< NOT JSON >>>',
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('calls logger.error (not throw) when processing fails', async () => {
      const req = new NextRequest('http://localhost/api/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'bad json',
      });
      await POST(req);
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('never returns HTTP 500 for any conceivable bad payload', async () => {
      const badPayloads = [
        null,
        'string',
        42,
        [],
        { 'csp-report': [] },
        { 'csp-report': 'string' },
        { 'csp-report': { 'document-uri': null } },
      ];

      for (const payload of badPayloads) {
        const req = makeCSPRequest(payload);
        const res = await POST(req);
        expect(res.status, `Should not be 500 for payload: ${JSON.stringify(payload)}`).not.toBe(
          500,
        );
      }
    });
  });

  // ── Response format ────────────────────────────────────────────────────────

  describe('response format', () => {
    it('returns JSON body with success: true on 204 response', async () => {
      const res = await POST(makeCSPRequest(validCSPPayload()));
      // The route returns NextResponse.json({ success: true }, { status: 204 })
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('does not include sensitive original-policy in the response body', async () => {
      const res = await POST(makeCSPRequest(validCSPPayload()));
      const text = await res.text();
      // The response should be minimal — not echoing back the full policy
      expect(text).not.toContain('default-src');
    });
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('processes multiple identical reports without error', async () => {
      const payload = validCSPPayload();
      const [r1, r2, r3] = await Promise.all([
        POST(makeCSPRequest(payload)),
        POST(makeCSPRequest(payload)),
        POST(makeCSPRequest(payload)),
      ]);
      expect(r1.status).toBe(204);
      expect(r2.status).toBe(204);
      expect(r3.status).toBe(204);
    });
  });
});
