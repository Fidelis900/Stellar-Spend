/**
 * Test fixtures/factories for multisig settlement scenarios — Issue #840
 *
 * Covers common states and ensures factories work correctly with deterministic seeding
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  seed,
  seedWith,
  makeMultisigProposal,
  makeMultisigSignature,
  pendingMultisigProposal,
  executedMultisigProposal,
  expiredMultisigProposal,
  partiallySignedMultisigProposal,
  makeMultisigProposals,
  makeMultisigSignatures,
  type MultisigProposal,
  type MultisigSignature,
} from '@/test/factories';

describe('MultisigSettlement Factory — Proposals', () => {
  beforeEach(() => seed());

  it('creates a default pending proposal', () => {
    const proposal = makeMultisigProposal();

    expect(proposal.id).toMatch(/^proposal_\d+$/);
    expect(proposal.description).toBeDefined();
    expect(proposal.target).toMatch(/^G[A-Z0-9]{55}$/);
    expect(proposal.value).toBeDefined();
    expect(proposal.executed).toBe(false);
    expect(proposal.executedBy).toBeUndefined();
    expect(proposal.executedAt).toBeUndefined();
    expect(proposal.createdAt).toBeGreaterThan(0);
    expect(proposal.expiresAt).toBeGreaterThan(proposal.createdAt);
  });

  it('generates deterministic IDs with seeding', () => {
    const proposal1a = makeMultisigProposal();
    seed(); // Reset
    const proposal1b = makeMultisigProposal();

    expect(proposal1a.id).toBe(proposal1b.id);
    expect(proposal1a.target).toBe(proposal1b.target);
    expect(proposal1a.description).toBe(proposal1b.description);
  });

  it('generates unique IDs across calls', () => {
    const proposal1 = makeMultisigProposal();
    const proposal2 = makeMultisigProposal();
    const proposal3 = makeMultisigProposal();

    expect(proposal1.id).not.toBe(proposal2.id);
    expect(proposal2.id).not.toBe(proposal3.id);
    expect(proposal1.id).not.toBe(proposal3.id);
  });

  it('respects overrides', () => {
    const customValue = '5000000';
    const customDescription = 'Custom Settlement';
    const customTarget = 'G' + 'Z'.repeat(55);

    const proposal = makeMultisigProposal({
      value: customValue,
      description: customDescription,
      target: customTarget,
    });

    expect(proposal.value).toBe(customValue);
    expect(proposal.description).toBe(customDescription);
    expect(proposal.target).toBe(customTarget);
  });

  it('creates pending proposals (trait)', () => {
    const proposal = pendingMultisigProposal();

    expect(proposal.executed).toBe(false);
    expect(proposal.executedBy).toBeUndefined();
    expect(proposal.executedAt).toBeUndefined();
  });

  it('creates executed proposals (trait)', () => {
    const proposal = executedMultisigProposal();

    expect(proposal.executed).toBe(true);
    expect(proposal.executedBy).toBeDefined();
    expect(proposal.executedAt).toBeDefined();
    expect(proposal.executedAt).toBeLessThan(Date.now());
  });

  it('creates expired proposals (trait)', () => {
    const now = Date.now();
    const proposal = expiredMultisigProposal();

    expect(proposal.executed).toBe(false);
    expect(proposal.expiresAt).toBeLessThan(now);
  });

  it('creates multiple proposals', () => {
    const proposals = makeMultisigProposals(5);

    expect(proposals.length).toBe(5);
    expect(proposals[0].id).not.toBe(proposals[1].id);
    proposals.forEach((p) => {
      expect(p.target).toMatch(/^G[A-Z0-9]{55}$/);
      expect(p.value).toBeDefined();
    });
  });

  it('proposal expiration is 7 days from creation', () => {
    const proposal = makeMultisigProposal();
    const expectedExpiration = proposal.createdAt + 7 * 24 * 60 * 60 * 1000;

    expect(proposal.expiresAt).toBe(expectedExpiration);
  });
});

describe('MultisigSettlement Factory — Signatures', () => {
  beforeEach(() => seed());

  it('creates a default signature', () => {
    const signature = makeMultisigSignature('proposal_0001');

    expect(signature.id).toMatch(/^sig_\d+$/);
    expect(signature.proposalId).toBe('proposal_0001');
    expect(signature.signer).toMatch(/^G[A-Z0-9]{55}$/);
    expect(signature.signature).toMatch(/^[a-f0-9]{128}$/); // 64 bytes = 128 hex chars
    expect(signature.signedAt).toBeGreaterThan(0);
  });

  it('associates signature with a proposal', () => {
    const proposalId = 'proposal_custom_123';
    const signature = makeMultisigSignature(proposalId);

    expect(signature.proposalId).toBe(proposalId);
  });

  it('generates unique signatures', () => {
    const sig1 = makeMultisigSignature('proposal_0001');
    const sig2 = makeMultisigSignature('proposal_0001');
    const sig3 = makeMultisigSignature('proposal_0001');

    expect(sig1.signature).not.toBe(sig2.signature);
    expect(sig2.signature).not.toBe(sig3.signature);
  });

  it('respects signature overrides', () => {
    const customSigner = 'G' + 'X'.repeat(55);
    const customSignature = 'a'.repeat(128);

    const signature = makeMultisigSignature('proposal_0001', {
      signer: customSigner,
      signature: customSignature,
    });

    expect(signature.signer).toBe(customSigner);
    expect(signature.signature).toBe(customSignature);
  });

  it('creates multiple signatures for a proposal', () => {
    const proposalId = 'proposal_0001';
    const signatures = makeMultisigSignatures(3, proposalId);

    expect(signatures.length).toBe(3);
    signatures.forEach((s) => {
      expect(s.proposalId).toBe(proposalId);
      expect(s.signer).toMatch(/^G[A-Z0-9]{55}$/);
    });
  });

  it('generates deterministic signatures with seeding', () => {
    const sig1a = makeMultisigSignature('proposal_0001');
    seed(); // Reset
    const sig1b = makeMultisigSignature('proposal_0001');

    expect(sig1a.id).toBe(sig1b.id);
    expect(sig1a.signer).toBe(sig1b.signer);
    expect(sig1a.signature).toBe(sig1b.signature);
  });
});

describe('MultisigSettlement Factory — Composed Scenarios', () => {
  beforeEach(() => seed());

  it('creates a partially signed proposal with 2 signers', () => {
    const { proposal, signatures } = partiallySignedMultisigProposal(2);

    expect(proposal.executed).toBe(false);
    expect(signatures.length).toBe(2);
    expect(signatures[0].proposalId).toBe(proposal.id);
    expect(signatures[1].proposalId).toBe(proposal.id);
    expect(signatures[0].signer).not.toBe(signatures[1].signer);
  });

  it('creates a partially signed proposal with 5 signers', () => {
    const { proposal, signatures } = partiallySignedMultisigProposal(5);

    expect(signatures.length).toBe(5);
    const uniqueSigners = new Set(signatures.map((s) => s.signer));
    expect(uniqueSigners.size).toBe(5);
  });

  it('respects overrides in partially signed proposals', () => {
    const customValue = '10000000';
    const { proposal, signatures } = partiallySignedMultisigProposal(3, {
      value: customValue,
    });

    expect(proposal.value).toBe(customValue);
    expect(signatures.length).toBe(3);
  });

  it('supports deterministic multisig settlement workflow', () => {
    // Setup: Create a proposal with required signers
    const requiredSignatures = 3;
    const { proposal, signatures } = partiallySignedMultisigProposal(requiredSignatures);

    // Verify proposal state
    expect(proposal.executed).toBe(false);
    expect(signatures.length).toBe(requiredSignatures);

    // Simulate execution
    const executedProposal: MultisigProposal = {
      ...proposal,
      executed: true,
      executedBy: signatures[0].signer,
      executedAt: Date.now(),
    };

    expect(executedProposal.executed).toBe(true);
    expect(executedProposal.executedBy).toBe(signatures[0].signer);
  });
});

describe('MultisigSettlement Factory — Edge Cases', () => {
  it('handles zero signatures', () => {
    const proposalId = 'proposal_0001';
    const signatures = makeMultisigSignatures(0, proposalId);

    expect(signatures.length).toBe(0);
  });

  it('handles large numbers of signatures', () => {
    const proposalId = 'proposal_0001';
    const signatures = makeMultisigSignatures(15, proposalId);

    expect(signatures.length).toBe(15);
  });

  it('maintains valid Stellar address format', () => {
    const stellarAddressRegex = /^G[A-Z0-9]{55}$/;

    for (let i = 0; i < 10; i++) {
      const proposal = makeMultisigProposal();
      expect(proposal.target).toMatch(stellarAddressRegex);

      const signature = makeMultisigSignature(proposal.id);
      expect(signature.signer).toMatch(stellarAddressRegex);
    }
  });

  it('proposal value is numeric string', () => {
    const proposal = makeMultisigProposal();
    expect(/^\d+$/.test(proposal.value)).toBe(true);
    expect(BigInt(proposal.value)).toBeGreaterThan(0n);
  });

  it('signature is 128-character hex string', () => {
    const signature = makeMultisigSignature('proposal_0001');
    expect(signature.signature).toMatch(/^[a-f0-9]{128}$/);
  });
});

describe('MultisigSettlement Factory — Seeding Consistency', () => {
  it('produces identical results with same seed', () => {
    const seed1 = seedWith(42);
    const proposal1 = makeMultisigProposal();
    const signature1 = makeMultisigSignature(proposal1.id);

    const seed2 = seedWith(42);
    const proposal2 = makeMultisigProposal();
    const signature2 = makeMultisigSignature(proposal2.id);

    expect(proposal1).toEqual(proposal2);
    expect(signature1.signer).toBe(signature2.signer);
  });

  it('produces different results with different seeds', () => {
    const proposal1 = seedWith(1) as unknown;
    const p1 = makeMultisigProposal();

    const proposal2 = seedWith(2) as unknown;
    const p2 = makeMultisigProposal();

    // IDs should differ because they're based on counters
    expect(p1.id).not.toBe(p2.id);
  });
});
