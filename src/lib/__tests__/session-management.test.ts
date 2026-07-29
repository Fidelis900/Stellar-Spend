import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock database pool & logger before importing service
vi.mock('../db/client', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { pool } from '../db/client';
import { SessionManagementService } from '../session-management';

describe('Session Management Service - Expiry & Revocation Workflow', () => {
  let sessionService: SessionManagementService;
  const mockUserAddress = 'GBXXXXXXXXUSERADDRESS12345';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionService = new SessionManagementService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session Creation & Validation', () => {
    it('should create a new session and save to database with correct expiration', async () => {
      const now = new Date('2026-07-28T12:00:00.000Z').getTime();
      vi.setSystemTime(now);

      (pool.query as any)
        .mockResolvedValueOnce({ rows: [] }) // _enforceConcurrentLimit getUserSessions
        .mockResolvedValueOnce({ rowCount: 1 }); // INSERT session

      const session = await sessionService.createSession(
        mockUserAddress,
        '192.168.1.1',
        'Mozilla/5.0',
        'device-fp-123',
      );

      expect(session.userAddress).toBe(mockUserAddress);
      expect(session.isActive).toBe(true);
      expect(session.expiresAt).toBe(now + 30 * 60 * 1000); // Default 30 min timeout
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([
          expect.stringMatching(/^session_/),
          mockUserAddress,
          expect.any(String),
          expect.any(String),
          '192.168.1.1',
          'Mozilla/5.0',
          'device-fp-123',
          true,
          now,
          now + 30 * 60 * 1000,
          now,
          0,
        ]),
      );
    });

    it('should validate an active non-expired session', async () => {
      const now = new Date('2026-07-28T12:10:00.000Z').getTime();
      const expiresAt = now + 20 * 60 * 1000;
      vi.setSystemTime(now);

      const mockSessionRow = {
        id: 'session-active-1',
        user_address: mockUserAddress,
        token: 'valid-token-123',
        refresh_token: 'refresh-token-123',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        is_active: true,
        created_at: now - 10 * 60 * 1000,
        expiresAt: expiresAt,
        expires_at: expiresAt,
        last_activity_at: now - 5 * 60 * 1000,
        activity_count: 2,
      };

      (pool.query as any)
        .mockResolvedValueOnce({ rows: [mockSessionRow] }) // SELECT session
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE last_activity_at

      const session = await sessionService.validateSession('valid-token-123', '192.168.1.1');

      expect(session).not.toBeNull();
      expect(session?.id).toBe('session-active-1');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET last_activity_at'),
        [now, 'session-active-1'],
      );
    });
  });

  describe('Session Expiry Handling', () => {
    it('should invalidate and automatically revoke an expired session upon validation', async () => {
      const now = new Date('2026-07-28T12:35:00.000Z').getTime();
      const expiresAt = now - 5 * 60 * 1000; // Expired 5 minutes ago
      vi.setSystemTime(now);

      const expiredSessionRow = {
        id: 'session-expired-1',
        user_address: mockUserAddress,
        token: 'expired-token-123',
        is_active: true,
        expires_at: expiresAt,
      };

      (pool.query as any)
        .mockResolvedValueOnce({ rows: [expiredSessionRow] }) // SELECT token
        .mockResolvedValueOnce({ rows: [{ user_address: mockUserAddress }] }) // revokeSession SELECT
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE is_active = false
        .mockResolvedValueOnce({ rowCount: 1 }); // INSERT session_revocations

      const result = await sessionService.validateSession('expired-token-123');

      expect(result).toBeNull();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_revocations'),
        expect.arrayContaining([
          expect.stringMatching(/^revocation_/),
          'session-expired-1',
          mockUserAddress,
          'Session expired',
          now,
        ]),
      );
    });

    it('should bulk cleanup all expired sessions in the database', async () => {
      const now = new Date('2026-07-28T13:00:00.000Z').getTime();
      vi.setSystemTime(now);

      (pool.query as any).mockResolvedValueOnce({ rowCount: 4 });

      const cleanedCount = await sessionService.cleanupExpiredSessions();

      expect(cleanedCount).toBe(4);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET is_active = false WHERE expires_at < $1'),
        [now],
      );
    });
  });

  describe('Session Revocation & Forced Password Reset Revocation Workflow', () => {
    it('should revoke a single specific session with reason', async () => {
      const now = new Date('2026-07-28T12:15:00.000Z').getTime();
      vi.setSystemTime(now);

      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ user_address: mockUserAddress }] }) // SELECT user_address
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE is_active = false
        .mockResolvedValueOnce({ rowCount: 1 }); // INSERT session_revocations

      await sessionService.revokeSession('session-to-revoke', 'User logged out');

      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE sessions SET is_active = false WHERE id = $1',
        ['session-to-revoke'],
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session_revocations'),
        [
          expect.stringMatching(/^revocation_/),
          'session-to-revoke',
          mockUserAddress,
          'User logged out',
          now,
        ],
      );
    });

    it('should perform forced-revocation of all user sessions (e.g., password change / security reset)', async () => {
      const now = new Date('2026-07-28T12:20:00.000Z').getTime();
      vi.setSystemTime(now);

      const activeUserSessions = [
        { id: 'sess-device-mobile' },
        { id: 'sess-device-desktop' },
        { id: 'sess-device-tablet' },
      ];

      (pool.query as any)
        .mockResolvedValueOnce({ rows: activeUserSessions }) // SELECT user sessions
        // Revoke 1
        .mockResolvedValueOnce({ rows: [{ user_address: mockUserAddress }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        // Revoke 2
        .mockResolvedValueOnce({ rows: [{ user_address: mockUserAddress }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        // Revoke 3
        .mockResolvedValueOnce({ rows: [{ user_address: mockUserAddress }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await sessionService.revokeAllUserSessions(mockUserAddress, 'Password changed by user');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'SELECT id FROM sessions WHERE user_address = $1 AND is_active = true',
        ),
        [mockUserAddress],
      );

      // Verify that all 3 active sessions were revoked
      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE sessions SET is_active = false WHERE id = $1',
        ['sess-device-mobile'],
      );
      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE sessions SET is_active = false WHERE id = $1',
        ['sess-device-desktop'],
      );
      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE sessions SET is_active = false WHERE id = $1',
        ['sess-device-tablet'],
      );
    });
  });

  describe('Session Refresh & Concurrent Limits', () => {
    it('should refresh an active session extending expiration', async () => {
      const now = new Date('2026-07-28T12:25:00.000Z').getTime();
      vi.setSystemTime(now);

      const refreshRow = {
        id: 'sess-refresh-1',
        user_address: mockUserAddress,
        token: 'token-1',
        refresh_token: 'refresh-token-1',
        is_active: true,
      };

      (pool.query as any)
        .mockResolvedValueOnce({ rows: [refreshRow] }) // SELECT refresh token
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE expires_at, refreshed_at

      const refreshed = await sessionService.refreshSession('refresh-token-1');

      expect(refreshed).not.toBeNull();
      expect(refreshed?.expiresAt).toBe(now + 30 * 60 * 1000);
      expect(refreshed?.refreshedAt).toBe(now);
    });
  });
});
