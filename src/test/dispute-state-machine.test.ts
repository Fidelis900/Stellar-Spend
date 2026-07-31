/**
 * #846 – Transaction dispute state machine unit tests
 *
 * Exercises the DisputeRepository defined in
 * src/lib/repositories/dispute-repository.ts which backs the dispute table
 * created by migrations/010_create_transaction_disputes.sql.
 *
 * Valid states:   open | in_review | escalated | resolved | rejected
 * Valid transitions (from VALID_TRANSITIONS):
 *   open        → in_review, rejected, escalated
 *   in_review   → resolved, rejected, escalated
 *   escalated   → in_review, resolved, rejected
 *   resolved    → (terminal)
 *   rejected    → (terminal)
 *
 * Tests cover:
 *  - Creating a dispute and verifying default state is "open"
 *  - Every valid transition succeeds
 *  - Every invalid transition throws an error
 *  - Terminal states (resolved / rejected) cannot be transitioned out of
 *  - Escalation path and its guard
 *  - Resolution and rejection paths
 *  - Notes (internal / external) and note retrieval
 *  - Analytics counters and resolution metrics
 *  - Assignment helpers
 *  - Edge cases: missing dispute id, duplicate operations
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DisputeRepository } from '@/lib/repositories';
import type { DisputeStatus } from '@shared/types/disputes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCreateRequest(overrides = {}) {
  return {
    transactionId: 'tx_abc123',
    reason: 'incorrect_amount',
    description: 'I was charged twice',
    priority: 'medium' as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dispute state machine unit tests (#846)', () => {
  let repo: DisputeRepository;

  beforeEach(() => {
    // Each test gets a fresh in-memory repository so state does not leak.
    repo = new DisputeRepository();
  });

  // ── Creation ───────────────────────────────────────────────────────────────

  describe('createDispute', () => {
    it('creates a dispute with status "open"', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      expect(dispute.status).toBe('open');
    });

    it('populates all required fields', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      expect(dispute.id).toBeTruthy();
      expect(dispute.transactionId).toBe('tx_abc123');
      expect(dispute.userAddress).toBe('0xUser1');
      expect(typeof dispute.createdAt).toBe('number');
      expect(typeof dispute.updatedAt).toBe('number');
    });

    it('assigns the priority from the request', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest({ priority: 'high' }));
      expect(dispute.priority).toBe('high');
    });

    it('defaults to "medium" priority when not specified', async () => {
      const req = { transactionId: 'tx_1', reason: 'other' };
      const dispute = await repo.createDispute('0xUser1', req);
      expect(dispute.priority).toBe('medium');
    });

    it('assigns a unique id to each dispute', async () => {
      const d1 = await repo.createDispute('0xUser1', makeCreateRequest());
      const d2 = await repo.createDispute('0xUser1', makeCreateRequest());
      expect(d1.id).not.toBe(d2.id);
    });
  });

  // ── Retrieval ──────────────────────────────────────────────────────────────

  describe('getDispute', () => {
    it('returns the created dispute by id', async () => {
      const created = await repo.createDispute('0xUser1', makeCreateRequest());
      const fetched = await repo.getDispute(created.id);
      expect(fetched?.id).toBe(created.id);
    });

    it('returns null for a non-existent id', async () => {
      const result = await repo.getDispute('nonexistent_id');
      expect(result).toBeNull();
    });
  });

  // ── Valid transitions ──────────────────────────────────────────────────────

  describe('valid status transitions', () => {
    const validTransitionPairs: Array<[DisputeStatus, DisputeStatus]> = [
      ['open', 'in_review'],
      ['open', 'rejected'],
      ['open', 'escalated'],
      ['in_review', 'resolved'],
      ['in_review', 'rejected'],
      ['in_review', 'escalated'],
      ['escalated', 'in_review'],
      ['escalated', 'resolved'],
      ['escalated', 'rejected'],
    ];

    for (const [from, to] of validTransitionPairs) {
      it(`allows transition: ${from} → ${to}`, async () => {
        const dispute = await repo.createDispute('0xUser1', makeCreateRequest());

        // Move dispute to the `from` state first if it isn't already "open"
        if (from !== 'open') {
          // Chain of moves to reach the desired `from` state
          if (from === 'in_review') {
            await repo.updateDispute(dispute.id, { status: 'in_review' });
          } else if (from === 'escalated') {
            await repo.escalateDispute(dispute.id, 'admin', 'needs escalation');
          }
        }

        const updated = await repo.updateDispute(dispute.id, { status: to });
        expect(updated?.status).toBe(to);
      });
    }
  });

  // ── Invalid transitions ────────────────────────────────────────────────────

  describe('invalid status transitions', () => {
    const invalidTransitionPairs: Array<[DisputeStatus, DisputeStatus]> = [
      ['open', 'resolved'], // must go through in_review first
      ['open', 'open'], // no-op is not in the table (stays same, but not "invalid")
      ['resolved', 'open'], // terminal
      ['resolved', 'in_review'], // terminal
      ['resolved', 'escalated'], // terminal
      ['resolved', 'rejected'], // terminal
      ['rejected', 'open'], // terminal
      ['rejected', 'in_review'], // terminal
      ['rejected', 'escalated'], // terminal
      ['rejected', 'resolved'], // terminal
    ];

    for (const [from, to] of invalidTransitionPairs) {
      it(`rejects invalid transition: ${from} → ${to}`, async () => {
        const dispute = await repo.createDispute('0xUser1', makeCreateRequest());

        // Reach the `from` state
        if (from === 'resolved') {
          await repo.updateDispute(dispute.id, { status: 'in_review' });
          await repo.updateDispute(dispute.id, { status: 'resolved' });
        } else if (from === 'rejected') {
          await repo.updateDispute(dispute.id, { status: 'rejected' });
        }

        // Attempting the invalid transition should throw
        await expect(repo.updateDispute(dispute.id, { status: to })).rejects.toThrow(
          /invalid status transition/i,
        );
      });
    }
  });

  // ── Terminal states ────────────────────────────────────────────────────────

  describe('terminal states', () => {
    it('resolved dispute cannot be transitioned to any other state', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'in_review' });
      await repo.updateDispute(dispute.id, { status: 'resolved' });

      for (const target of ['open', 'in_review', 'escalated', 'rejected'] as DisputeStatus[]) {
        await expect(repo.updateDispute(dispute.id, { status: target })).rejects.toThrow(
          /invalid status transition/i,
        );
      }
    });

    it('rejected dispute cannot be transitioned to any other state', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'rejected' });

      for (const target of ['open', 'in_review', 'escalated', 'resolved'] as DisputeStatus[]) {
        await expect(repo.updateDispute(dispute.id, { status: target })).rejects.toThrow(
          /invalid status transition/i,
        );
      }
    });

    it('sets resolvedAt when status transitions to resolved', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'in_review' });
      const resolved = await repo.updateDispute(dispute.id, { status: 'resolved' });
      expect(resolved?.resolvedAt).toBeDefined();
      expect(typeof resolved?.resolvedAt).toBe('number');
    });

    it('sets resolvedAt when status transitions to rejected', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      const rejected = await repo.updateDispute(dispute.id, { status: 'rejected' });
      expect(rejected?.resolvedAt).toBeDefined();
    });
  });

  // ── Escalation path ────────────────────────────────────────────────────────

  describe('escalateDispute', () => {
    it('transitions an open dispute to escalated', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      const escalated = await repo.escalateDispute(
        dispute.id,
        'admin_1',
        'Customer is VIP, needs fast resolution',
        'high',
      );
      expect(escalated?.status).toBe('escalated');
    });

    it('attaches escalation metadata to the dispute', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      const escalated = await repo.escalateDispute(
        dispute.id,
        'admin_1',
        'Escalation reason',
        'critical',
      );
      expect(escalated?.escalation).toBeDefined();
      expect(escalated?.escalation?.escalatedBy).toBe('admin_1');
      expect(escalated?.escalation?.reason).toBe('Escalation reason');
      expect(escalated?.escalation?.priority).toBe('critical');
    });

    it('throws when trying to escalate an already resolved dispute', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'in_review' });
      await repo.updateDispute(dispute.id, { status: 'resolved' });

      await expect(repo.escalateDispute(dispute.id, 'admin', 'late escalation')).rejects.toThrow(
        /cannot escalate/i,
      );
    });

    it('returns null when dispute id does not exist', async () => {
      const result = await repo.escalateDispute('nonexistent_id', 'admin', 'reason');
      expect(result).toBeNull();
    });

    it('escalated dispute can transition back to in_review', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.escalateDispute(dispute.id, 'admin', 'reason');
      const updated = await repo.updateDispute(dispute.id, { status: 'in_review' });
      expect(updated?.status).toBe('in_review');
    });
  });

  // ── Resolution helpers ─────────────────────────────────────────────────────

  describe('resolveDispute', () => {
    it('resolves a dispute in in_review state', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'in_review' });
      const resolved = await repo.resolveDispute(dispute.id, 'resolved', 'Refund issued');
      expect(resolved?.status).toBe('resolved');
      expect(resolved?.resolutionNotes).toBe('Refund issued');
    });

    it('rejects a dispute and records resolution notes', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'in_review' });
      const rejected = await repo.resolveDispute(dispute.id, 'rejected', 'Transaction was valid');
      expect(rejected?.status).toBe('rejected');
      expect(rejected?.resolutionNotes).toBe('Transaction was valid');
    });

    it('returns null for a non-existent dispute', async () => {
      const result = await repo.resolveDispute('ghost_id', 'resolved', 'notes');
      expect(result).toBeNull();
    });
  });

  // ── Notes ──────────────────────────────────────────────────────────────────

  describe('addNote / getNotes', () => {
    it('adds a public note to a dispute', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      const note = await repo.addNote(dispute.id, 'agent_1', 'We are reviewing', false);
      expect(note?.content).toBe('We are reviewing');
      expect(note?.isInternal).toBe(false);
    });

    it('adds an internal note to a dispute', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.addNote(dispute.id, 'agent_1', 'Internal: flag for fraud review', true);
      const all = await repo.getNotes(dispute.id, true);
      expect(all.some((n) => n.isInternal)).toBe(true);
    });

    it('getNotes excludes internal notes by default', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.addNote(dispute.id, 'agent_1', 'Public note', false);
      await repo.addNote(dispute.id, 'agent_2', 'Internal note', true);

      const publicNotes = await repo.getNotes(dispute.id);
      expect(publicNotes.every((n) => !n.isInternal)).toBe(true);
      expect(publicNotes).toHaveLength(1);
    });

    it('getNotes with includeInternal=true returns both public and internal', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.addNote(dispute.id, 'a', 'Public', false);
      await repo.addNote(dispute.id, 'b', 'Internal', true);

      const all = await repo.getNotes(dispute.id, true);
      expect(all).toHaveLength(2);
    });

    it('returns null when adding a note to a non-existent dispute', async () => {
      const result = await repo.addNote('ghost_id', 'agent', 'note');
      expect(result).toBeNull();
    });
  });

  // ── Assignment ─────────────────────────────────────────────────────────────

  describe('assignDispute', () => {
    it('assigns an agent to a dispute', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      const assigned = await repo.assignDispute(dispute.id, 'agent_42');
      expect(assigned?.assignedTo).toBe('agent_42');
    });
  });

  // ── Listing ────────────────────────────────────────────────────────────────

  describe('listDisputes', () => {
    it('returns all disputes when no status filter is provided', async () => {
      await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.createDispute('0xUser2', makeCreateRequest({ transactionId: 'tx_2' }));
      const list = await repo.listDisputes();
      expect(list).toHaveLength(2);
    });

    it('filters by status correctly', async () => {
      const d1 = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.createDispute('0xUser2', makeCreateRequest({ transactionId: 'tx_2' }));

      // Move d1 to in_review
      await repo.updateDispute(d1.id, { status: 'in_review' });

      const openDisputes = await repo.listDisputes('open');
      expect(openDisputes).toHaveLength(1);
      expect(openDisputes[0].status).toBe('open');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.createDispute(`0xUser${i}`, makeCreateRequest({ transactionId: `tx_${i}` }));
      }
      const page1 = await repo.listDisputes(undefined, 2, 0);
      const page2 = await repo.listDisputes(undefined, 2, 2);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      // Pages should not overlap
      const ids1 = page1.map((d) => d.id);
      const ids2 = page2.map((d) => d.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });
  });

  // ── Analytics ─────────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('returns zero totals for an empty repository', async () => {
      const analytics = await repo.getAnalytics();
      expect(analytics.total).toBe(0);
      expect(analytics.escalationRate).toBe(0);
      expect(analytics.resolutionRate).toBe(0);
      expect(analytics.avgResolutionTimeMs).toBeNull();
    });

    it('counts disputes per status accurately', async () => {
      const d1 = await repo.createDispute('0xUser1', makeCreateRequest());
      const d2 = await repo.createDispute('0xUser2', makeCreateRequest({ transactionId: 'tx_2' }));
      const d3 = await repo.createDispute('0xUser3', makeCreateRequest({ transactionId: 'tx_3' }));

      await repo.updateDispute(d1.id, { status: 'in_review' });
      await repo.updateDispute(d1.id, { status: 'resolved' });
      await repo.updateDispute(d2.id, { status: 'rejected' });
      // d3 stays open

      const analytics = await repo.getAnalytics();
      expect(analytics.total).toBe(3);
      expect(analytics.byStatus.open).toBe(1);
      expect(analytics.byStatus.resolved).toBe(1);
      expect(analytics.byStatus.rejected).toBe(1);
    });

    it('calculates escalationRate correctly', async () => {
      const d1 = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.createDispute('0xUser2', makeCreateRequest({ transactionId: 'tx_2' }));

      // Escalate d1
      await repo.escalateDispute(d1.id, 'admin', 'reason');

      const analytics = await repo.getAnalytics();
      // 1 of 2 disputes escalated → 50%
      expect(analytics.escalationRate).toBeCloseTo(0.5);
    });

    it('calculates resolutionRate correctly', async () => {
      const d1 = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.createDispute('0xUser2', makeCreateRequest({ transactionId: 'tx_2' }));

      await repo.updateDispute(d1.id, { status: 'in_review' });
      await repo.updateDispute(d1.id, { status: 'resolved' });

      const analytics = await repo.getAnalytics();
      // 1 of 2 resolved
      expect(analytics.resolutionRate).toBeCloseTo(0.5);
    });

    it('computes avgResolutionTimeMs as a positive number when disputes are resolved', async () => {
      const dispute = await repo.createDispute('0xUser1', makeCreateRequest());
      await repo.updateDispute(dispute.id, { status: 'in_review' });
      await repo.updateDispute(dispute.id, { status: 'resolved' });

      const analytics = await repo.getAnalytics();
      expect(analytics.avgResolutionTimeMs).not.toBeNull();
      expect(analytics.avgResolutionTimeMs!).toBeGreaterThanOrEqual(0);
    });
  });

  // ── getDisputesByTransaction / getDisputesByUser ───────────────────────────

  describe('getDisputesByTransaction / getDisputesByUser', () => {
    it('returns disputes for a specific transaction', async () => {
      await repo.createDispute('0xUser1', makeCreateRequest({ transactionId: 'tx_target' }));
      await repo.createDispute('0xUser2', makeCreateRequest({ transactionId: 'tx_other' }));

      const found = await repo.getDisputesByTransaction('tx_target');
      expect(found).toHaveLength(1);
      expect(found[0].transactionId).toBe('tx_target');
    });

    it('returns disputes for a specific user address', async () => {
      await repo.createDispute('0xAlice', makeCreateRequest());
      await repo.createDispute('0xAlice', makeCreateRequest({ transactionId: 'tx_2' }));
      await repo.createDispute('0xBob', makeCreateRequest({ transactionId: 'tx_3' }));

      const aliceDisputes = await repo.getDisputesByUser('0xAlice');
      expect(aliceDisputes).toHaveLength(2);
      expect(aliceDisputes.every((d) => d.userAddress === '0xAlice')).toBe(true);
    });

    it('returns disputes sorted by createdAt descending for a user', async () => {
      const d1 = await repo.createDispute('0xAlice', makeCreateRequest({ transactionId: 'tx_1' }));
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 2));
      const d2 = await repo.createDispute('0xAlice', makeCreateRequest({ transactionId: 'tx_2' }));

      const disputes = await repo.getDisputesByUser('0xAlice');
      // Most recent first
      expect(disputes[0].id).toBe(d2.id);
      expect(disputes[1].id).toBe(d1.id);
    });
  });

  // ── updateDispute returns null for non-existent disputes ──────────────────

  describe('updateDispute with non-existent id', () => {
    it('returns null when updating a non-existent dispute', async () => {
      const result = await repo.updateDispute('ghost_id', { status: 'in_review' });
      expect(result).toBeNull();
    });
  });
});
