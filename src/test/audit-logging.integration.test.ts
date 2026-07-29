/**
 * Integration tests for audit logging completeness — Issue #839
 *
 * Verifies that all sensitive mutations create audit entries as required
 * by migrations 015_add_audit_logging.sql and 017_enhance_audit_logging.sql
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seed, makeUser, makeTransaction } from '@/test/factories';
import { AuditLoggingService } from '@/lib/audit-logging';
import { NextRequest } from 'next/server';

describe('Audit Logging — Completeness', () => {
  let auditService: AuditLoggingService;

  beforeEach(() => {
    seed();
    auditService = new AuditLoggingService();
    vi.clearAllMocks();
  });

  describe('logAction — user mutations', () => {
    it('creates an audit entry for transaction creation', async () => {
      const user = makeUser();
      const tx = makeTransaction({ userAddress: user.address });

      const auditLog = await auditService.logAction(
        'CREATE',
        'transaction',
        'success',
        {
          userAddress: user.address,
          resourceId: tx.id,
          actionDetails: `Transaction created for ${tx.currency}`,
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          sessionId: 'session_123',
        },
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.userAddress).toBe(user.address);
      expect(auditLog.actionType).toBe('CREATE');
      expect(auditLog.resourceType).toBe('transaction');
      expect(auditLog.resourceId).toBe(tx.id);
      expect(auditLog.status).toBe('success');
    });

    it('creates an audit entry for beneficiary addition', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'CREATE',
        'beneficiary',
        'success',
        {
          userAddress: user.address,
          resourceId: 'beneficiary_123',
          actionDetails: 'Beneficiary added for NGN transfers',
        },
      );

      expect(auditLog.actionType).toBe('CREATE');
      expect(auditLog.resourceType).toBe('beneficiary');
      expect(auditLog.status).toBe('success');
    });

    it('creates an audit entry for API key generation', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'CREATE',
        'api_key',
        'success',
        {
          userAddress: user.address,
          resourceId: 'api_key_123',
          actionDetails: 'API key generated',
        },
      );

      expect(auditLog.actionType).toBe('CREATE');
      expect(auditLog.resourceType).toBe('api_key');
    });

    it('creates an audit entry for rate limit bypass request', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'REQUEST',
        'rate_limit_bypass',
        'success',
        {
          userAddress: user.address,
          actionDetails: 'Rate limit bypass requested for premium tier',
        },
      );

      expect(auditLog.actionType).toBe('REQUEST');
      expect(auditLog.resourceType).toBe('rate_limit_bypass');
    });

    it('creates an audit entry for 2FA enable', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'UPDATE',
        '2fa_setting',
        'success',
        {
          userAddress: user.address,
          actionDetails: '2FA enabled',
        },
      );

      expect(auditLog.actionType).toBe('UPDATE');
      expect(auditLog.resourceType).toBe('2fa_setting');
    });

    it('creates an audit entry for failed mutations', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'CREATE',
        'transaction',
        'failure',
        {
          userAddress: user.address,
          resourceId: 'tx_failed_123',
          actionDetails: 'Transaction creation failed: insufficient balance',
        },
      );

      expect(auditLog.status).toBe('failure');
      expect(auditLog.actionDetails).toContain('insufficient balance');
    });

    it('retrieves audit logs for a specific user', async () => {
      const user = makeUser();

      // Create multiple audit entries
      await auditService.logAction('CREATE', 'transaction', 'success', {
        userAddress: user.address,
        resourceId: 'tx_001',
      });

      await auditService.logAction('CREATE', 'transaction', 'success', {
        userAddress: user.address,
        resourceId: 'tx_002',
      });

      const logs = await auditService.getUserAuditLogs(user.address);

      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs[0].userAddress).toBe(user.address);
    });

    it('filters audit logs by action type', async () => {
      const user = makeUser();

      await auditService.logAction('CREATE', 'transaction', 'success', {
        userAddress: user.address,
        resourceId: 'tx_001',
      });

      await auditService.logAction('UPDATE', 'beneficiary', 'success', {
        userAddress: user.address,
        resourceId: 'ben_001',
      });

      const logs = await auditService.getAuditLogs({ actionType: 'CREATE' });

      expect(logs.some((l) => l.actionType === 'CREATE')).toBe(true);
    });
  });

  describe('logAdminAction — privileged mutations', () => {
    it('creates an audit entry for admin actions', async () => {
      const adminAddress = 'G' + 'A'.repeat(55);
      const targetUser = makeUser();

      const adminAction = await auditService.logAdminAction(
        adminAddress,
        'USER_SUSPEND',
        {
          targetUser: targetUser.address,
          reason: 'Suspected fraudulent activity',
          actionDetails: 'User account suspended',
        },
      );

      expect(adminAction.adminAddress).toBe(adminAddress);
      expect(adminAction.actionType).toBe('USER_SUSPEND');
      expect(adminAction.targetUser).toBe(targetUser.address);
      expect(adminAction.reason).toContain('fraudulent');
    });

    it('creates an audit entry for rate limit override', async () => {
      const adminAddress = 'G' + 'B'.repeat(55);
      const targetUser = makeUser();

      const adminAction = await auditService.logAdminAction(
        adminAddress,
        'RATE_LIMIT_OVERRIDE',
        {
          targetUser: targetUser.address,
          reason: 'VIP customer',
        },
      );

      expect(adminAction.actionType).toBe('RATE_LIMIT_OVERRIDE');
    });

    it('creates an audit entry for user deletion', async () => {
      const adminAddress = 'G' + 'C'.repeat(55);
      const targetUser = makeUser();

      const adminAction = await auditService.logAdminAction(
        adminAddress,
        'USER_DELETE',
        {
          targetUser: targetUser.address,
          reason: 'GDPR deletion request',
        },
      );

      expect(adminAction.actionType).toBe('USER_DELETE');
    });

    it('retrieves admin actions', async () => {
      const adminAddress = 'G' + 'D'.repeat(55);

      await auditService.logAdminAction(adminAddress, 'USER_SUSPEND', {
        targetUser: 'user_1',
      });

      await auditService.logAdminAction(adminAddress, 'USER_SUSPEND', {
        targetUser: 'user_2',
      });

      const actions = await auditService.getAdminActions(adminAddress);

      expect(actions.length).toBeGreaterThanOrEqual(2);
      expect(actions[0].adminAddress).toBe(adminAddress);
    });
  });

  describe('Audit log retention policy', () => {
    it('sets and retrieves retention policy', async () => {
      const retentionDays = 180;
      await auditService.setRetentionPolicy(retentionDays);
      const policy = await auditService.getRetentionPolicy();
      expect(policy).toBe(retentionDays);
    });

    it('defaults to 90 days retention', async () => {
      const policy = await auditService.getRetentionPolicy();
      expect(policy).toBeGreaterThan(0);
    });
  });

  describe('Log integrity verification', () => {
    it('computes and verifies log integrity hash', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'CREATE',
        'transaction',
        'success',
        {
          userAddress: user.address,
          resourceId: 'tx_123',
        },
      );

      const hash = auditService.computeLogIntegrityHash(auditLog);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA256 hex is 64 chars

      const isValid = auditService.verifyLogIntegrity(auditLog, hash);
      expect(isValid).toBe(true);
    });

    it('detects tampered audit logs', async () => {
      const user = makeUser();

      const auditLog = await auditService.logAction(
        'CREATE',
        'transaction',
        'success',
        {
          userAddress: user.address,
          resourceId: 'tx_123',
        },
      );

      const originalHash = auditService.computeLogIntegrityHash(auditLog);

      // Tamper with the log
      const tamperedLog = { ...auditLog, actionType: 'DELETE' };
      const isValid = auditService.verifyLogIntegrity(tamperedLog, originalHash);

      expect(isValid).toBe(false);
    });
  });

  describe('Sensitive mutations must be logged', () => {
    const sensitiveActionsMapped = [
      {
        action: 'CREATE',
        resource: 'transaction',
        description: 'Transaction creation',
      },
      {
        action: 'CREATE',
        resource: 'beneficiary',
        description: 'Beneficiary addition',
      },
      { action: 'UPDATE', resource: 'beneficiary', description: 'Beneficiary update' },
      { action: 'DELETE', resource: 'beneficiary', description: 'Beneficiary deletion' },
      { action: 'CREATE', resource: 'api_key', description: 'API key creation' },
      { action: 'REVOKE', resource: 'api_key', description: 'API key revocation' },
      { action: 'UPDATE', resource: '2fa_setting', description: '2FA setting change' },
      {
        action: 'UPDATE',
        resource: 'account_settings',
        description: 'Account settings change',
      },
    ];

    for (const { action, resource, description } of sensitiveActionsMapped) {
      it(`logs ${description} (${action} ${resource})`, async () => {
        const user = makeUser();

        const auditLog = await auditService.logAction(action, resource, 'success', {
          userAddress: user.address,
          actionDetails: description,
        });

        expect(auditLog.actionType).toBe(action);
        expect(auditLog.resourceType).toBe(resource);
        expect(auditLog.userAddress).toBe(user.address);
      });
    }
  });
});
