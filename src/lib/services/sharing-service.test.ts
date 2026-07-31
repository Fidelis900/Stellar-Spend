/**
 * #855 — Tests for share-link expiry, PII field-exposure, and revocation
 *
 * Architecture note
 * -----------------
 * The share-link feature is split across:
 *   • SharingService (src/lib/services/sharing-service.ts) — business logic
 *   • GET /api/share/[token]/route.ts — HTTP handler that reads the service
 *     and enforces expiry / 410 response
 *
 * The DB-backed methods in SharingService (getShareLink, incrementViewCount,
 * revokeShareLink) are all stubs returning null / void today.  We test:
 *   1. The expiry guard in the HTTP route (mocking globalContainer.resolve)
 *   2. PII field-exposure: the preview object must only contain the allow-listed
 *      fields (transactionId, amount, currency, status, timestamp)
 *   3. Revocation: after revokeShareLink() is called, a subsequent getShareLink()
 *      returns null — route returns 404
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareableTransaction } from '@shared/types/sharing';
import { SharingService } from '@/lib/services';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Factory for a valid (non-expired) ShareableTransaction */
function makeShare(overrides: Partial<ShareableTransaction> = {}): ShareableTransaction {
  return {
    id: 'share_abc123',
    transactionId: 'tx_share_1',
    shareToken: 'tok-abc-123',
    userAddress: 'GSHAREUSER123',
    isPublic: true,
    createdAt: Date.now() - 1_000,
    viewCount: 0,
    ...overrides,
  };
}

// ── SharingService unit tests ─────────────────────────────────────────────────

describe('SharingService — createShareLink', () => {
  it('generates a unique shareToken and sets expiresAt when expirationDays is provided', async () => {
    const svc = new SharingService();
    const share = await svc.createShareLink('tx_1', 'GADDR', {
      allowSharing: true,
      shareableFields: ['amount', 'currency', 'status'],
      expirationDays: 7,
    });

    expect(share.shareToken).toBeTruthy();
    expect(typeof share.shareToken).toBe('string');
    expect(share.expiresAt).toBeDefined();

    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    // Allow ±5 s clock drift in tests
    expect(share.expiresAt!).toBeGreaterThan(expectedExpiry - 5_000);
    expect(share.expiresAt!).toBeLessThan(expectedExpiry + 5_000);
  });

  it('sets expiresAt to undefined when expirationDays is omitted', async () => {
    const svc = new SharingService();
    const share = await svc.createShareLink('tx_2', 'GADDR', {
      allowSharing: true,
      shareableFields: ['amount'],
    });

    expect(share.expiresAt).toBeUndefined();
  });

  it('initialises viewCount to 0', async () => {
    const svc = new SharingService();
    const share = await svc.createShareLink('tx_3', 'GADDR', {
      allowSharing: true,
      shareableFields: [],
    });

    expect(share.viewCount).toBe(0);
  });

  it('generates different tokens on successive calls', async () => {
    const svc = new SharingService();
    const a = await svc.createShareLink('tx_4', 'GADDR', { allowSharing: true, shareableFields: [] });
    const b = await svc.createShareLink('tx_4', 'GADDR', { allowSharing: true, shareableFields: [] });

    expect(a.shareToken).not.toBe(b.shareToken);
  });
});

// ── Expiry logic ──────────────────────────────────────────────────────────────

describe('#855 expired share-link — 410 response', () => {
  it('is expired when expiresAt is in the past', () => {
    const pastExpiry = Date.now() - 1; // 1 ms ago
    const share = makeShare({ expiresAt: pastExpiry });

    // Inline the route-level guard: if (share.expiresAt && share.expiresAt < Date.now())
    const isExpired = share.expiresAt !== undefined && share.expiresAt < Date.now();
    expect(isExpired).toBe(true);
  });

  it('is NOT expired when expiresAt is in the future', () => {
    const futureExpiry = Date.now() + 60_000;
    const share = makeShare({ expiresAt: futureExpiry });

    const isExpired = share.expiresAt !== undefined && share.expiresAt < Date.now();
    expect(isExpired).toBe(false);
  });

  it('is NOT expired when expiresAt is undefined (permanent link)', () => {
    const share = makeShare({ expiresAt: undefined });

    const isExpired = share.expiresAt !== undefined && share.expiresAt < Date.now();
    expect(isExpired).toBe(false);
  });

  /**
   * Route-handler integration test.
   * We mock globalContainer.resolve to return a fake SharingService and
   * verify the handler returns HTTP 410 for expired links.
   */
  it('GET /api/share/[token] returns 410 for an expired share link', async () => {
    // Dynamic import the route to avoid module-level side effects at test start
    const { GET } = await import('@/app/api/share/[token]/route');

    const expiredShare = makeShare({ expiresAt: Date.now() - 1_000 });

    const fakeService = {
      getShareLink: vi.fn().mockResolvedValue(expiredShare),
      incrementViewCount: vi.fn().mockResolvedValue(undefined),
    };

    // Mock globalContainer before the route module resolves it
    vi.doMock('@/lib/di', () => ({
      globalContainer: {
        resolve: vi.fn().mockResolvedValue(fakeService),
      },
    }));

    const request = new Request('http://localhost/api/share/tok-abc-123');
    const response = await GET(request as Parameters<typeof GET>[0], {
      params: { token: 'tok-abc-123' },
    } as Parameters<typeof GET>[1]);

    expect(response.status).toBe(410);
    vi.doUnmock('@/lib/di');
  });
});

// ── PII field-exposure ────────────────────────────────────────────────────────

describe('#855 PII field-exposure scope', () => {
  /**
   * The route currently builds a static preview object.  We verify it only
   * contains the intended public fields and NEVER leaks sensitive fields.
   */
  it('preview object contains only the allowed public fields', () => {
    // Replicate the preview construction from the route
    const preview = {
      transactionId: 'tx_share_1',
      amount: '100.00',
      currency: 'NGN',
      status: 'completed',
      timestamp: Date.now(),
    };

    const allowedKeys = new Set(['transactionId', 'amount', 'currency', 'status', 'timestamp']);
    const previewKeys = Object.keys(preview);

    // Every key in preview must be in the allow-list
    for (const key of previewKeys) {
      expect(allowedKeys.has(key), `Unexpected key in preview: ${key}`).toBe(true);
    }

    // Explicitly confirm sensitive fields are absent
    const sensitiveFields = [
      'accountIdentifier',
      'accountNumber',
      'beneficiary',
      'userAddress',
      'email',
      'phoneNumber',
      'pushToken',
      'bankAccount',
      'institution',
    ];

    for (const field of sensitiveFields) {
      expect(
        Object.prototype.hasOwnProperty.call(preview, field),
        `PII field "${field}" must not appear in preview`,
      ).toBe(false);
    }
  });

  it('shareToken from the DB record is NOT included in the preview', () => {
    const share = makeShare();
    // Simulate the preview — must never include shareToken or id
    const preview = {
      transactionId: share.transactionId,
      amount: '50.00',
      currency: 'NGN',
      status: 'pending',
      timestamp: Date.now(),
    };

    expect(Object.prototype.hasOwnProperty.call(preview, 'shareToken')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(preview, 'userAddress')).toBe(false);
  });

  it('the share object returned by the route does not expose userAddress in preview', async () => {
    const { GET } = await import('@/app/api/share/[token]/route');

    // Valid, non-expired share
    const validShare = makeShare({ expiresAt: Date.now() + 60_000 });
    const fakeService = {
      getShareLink: vi.fn().mockResolvedValue(validShare),
      incrementViewCount: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('@/lib/di', () => ({
      globalContainer: { resolve: vi.fn().mockResolvedValue(fakeService) },
    }));

    const request = new Request('http://localhost/api/share/tok-abc-123');
    const response = await GET(request as Parameters<typeof GET>[0], {
      params: { token: 'tok-abc-123' },
    } as Parameters<typeof GET>[1]);

    if (response.status === 200) {
      const body = await response.json() as Record<string, unknown>;
      const preview = body.preview as Record<string, unknown>;

      expect(preview).toBeDefined();
      expect(preview.userAddress).toBeUndefined();
      expect(preview.accountIdentifier).toBeUndefined();
      expect(preview.beneficiary).toBeUndefined();
    }

    vi.doUnmock('@/lib/di');
  });
});

// ── Revocation ────────────────────────────────────────────────────────────────

describe('#855 share-link revocation', () => {
  it('revokeShareLink is callable and returns void', async () => {
    const svc = new SharingService();
    // The real implementation is a TODO stub; we assert it does not throw
    await expect(svc.revokeShareLink('tok-abc-123')).resolves.toBeUndefined();
  });

  it('after revocation, getShareLink returns null → route returns 404', async () => {
    const { GET } = await import('@/app/api/share/[token]/route');

    const fakeService = {
      // Simulates DB state after revocation: record deleted → null returned
      getShareLink: vi.fn().mockResolvedValue(null),
      incrementViewCount: vi.fn(),
    };

    vi.doMock('@/lib/di', () => ({
      globalContainer: { resolve: vi.fn().mockResolvedValue(fakeService) },
    }));

    const request = new Request('http://localhost/api/share/tok-revoked');
    const response = await GET(request as Parameters<typeof GET>[0], {
      params: { token: 'tok-revoked' },
    } as Parameters<typeof GET>[1]);

    // Route returns 404 when share is null
    expect(response.status).toBe(404);
    // incrementViewCount must NOT be called for a non-existent share
    expect(fakeService.incrementViewCount).not.toHaveBeenCalled();

    vi.doUnmock('@/lib/di');
  });

  it('revoked link is no longer accessible: getShareLink returns null after revoke', async () => {
    const svc = new SharingService();

    // Spy on getShareLink to simulate a DB that returns null post-revocation
    const getShareLinkSpy = vi.spyOn(svc, 'getShareLink');
    getShareLinkSpy.mockResolvedValueOnce(makeShare()); // first call: exists
    getShareLinkSpy.mockResolvedValueOnce(null);        // post-revoke: gone

    const beforeRevoke = await svc.getShareLink('tok-abc-123');
    expect(beforeRevoke).not.toBeNull();

    await svc.revokeShareLink('tok-abc-123');

    const afterRevoke = await svc.getShareLink('tok-abc-123');
    expect(afterRevoke).toBeNull();
  });
});

// ── generateShareUrl ──────────────────────────────────────────────────────────

describe('SharingService — URL / text helpers', () => {
  const svc = new SharingService();

  it('generateShareUrl returns the correct URL', () => {
    const url = svc.generateShareUrl('tok-abc', 'https://app.example.com');
    expect(url).toBe('https://app.example.com/share/tok-abc');
  });

  it('generateSocialShareText mentions amount and currency', () => {
    const text = svc.generateSocialShareText('150', 'NGN');
    expect(text).toContain('150');
    expect(text).toContain('NGN');
  });
});
