import crypto from 'crypto';
import { getDefaultRng, type Rng } from './rng';

export interface MultisigProposal {
  id: string;
  description: string;
  target: string;
  value: string;
  executed: boolean;
  executedBy?: string;
  executedAt?: number;
  createdAt: number;
  expiresAt: number;
}

export interface MultisigSignature {
  id: string;
  proposalId: string;
  signer: string;
  signature: string;
  signedAt: number;
}

let multisigProposalCounter = 0;
let multisigSignatureCounter = 0;

export function resetMultisigSettlementCounters() {
  multisigProposalCounter = 0;
  multisigSignatureCounter = 0;
}

function generateSignature(): string {
  return crypto.randomBytes(64).toString('hex');
}

function generateAddress(rng: Rng): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let address = 'G';
  for (let i = 0; i < 55; i++) {
    address += chars[rng.next() % chars.length];
  }
  return address;
}

export function makeMultisigProposal(
  overrides?: Partial<MultisigProposal>,
  rng?: Rng,
): MultisigProposal {
  const _rng = rng || getDefaultRng();
  const id = `proposal_${String(multisigProposalCounter++).padStart(4, '0')}`;
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  return {
    id,
    description: `Multisig Settlement Proposal ${multisigProposalCounter}`,
    target: generateAddress(_rng),
    value: '1000000', // 10 XLM in stroops
    executed: false,
    createdAt: now,
    expiresAt,
    ...overrides,
  };
}

export function makeMultisigSignature(
  proposalId?: string,
  overrides?: Partial<MultisigSignature>,
  rng?: Rng,
): MultisigSignature {
  const _rng = rng || getDefaultRng();
  const id = `sig_${String(multisigSignatureCounter++).padStart(4, '0')}`;
  const now = Date.now();

  return {
    id,
    proposalId: proposalId || `proposal_0001`,
    signer: generateAddress(_rng),
    signature: generateSignature(),
    signedAt: now,
    ...overrides,
  };
}

export function pendingMultisigProposal(
  overrides?: Partial<MultisigProposal>,
  rng?: Rng,
): MultisigProposal {
  return makeMultisigProposal({ executed: false, ...overrides }, rng);
}

export function executedMultisigProposal(
  overrides?: Partial<MultisigProposal>,
  rng?: Rng,
): MultisigProposal {
  const now = Date.now();
  return makeMultisigProposal(
    {
      executed: true,
      executedBy: `G${'A'.repeat(55)}`,
      executedAt: now - 3600000, // 1 hour ago
      ...overrides,
    },
    rng,
  );
}

export function expiredMultisigProposal(
  overrides?: Partial<MultisigProposal>,
  rng?: Rng,
): MultisigProposal {
  const now = Date.now();
  return makeMultisigProposal(
    {
      executed: false,
      expiresAt: now - 3600000, // expired 1 hour ago
      ...overrides,
    },
    rng,
  );
}

export function partiallySignedMultisigProposal(
  signerCount: number,
  overrides?: Partial<MultisigProposal>,
  rng?: Rng,
): { proposal: MultisigProposal; signatures: MultisigSignature[] } {
  const proposal = makeMultisigProposal({ executed: false, ...overrides }, rng);
  const signatures: MultisigSignature[] = [];

  for (let i = 0; i < signerCount; i++) {
    signatures.push(makeMultisigSignature(proposal.id, undefined, rng));
  }

  return { proposal, signatures };
}

export function makeMultisigProposals(
  count: number,
  overrides?: Partial<MultisigProposal>,
  rng?: Rng,
): MultisigProposal[] {
  return Array.from({ length: count }, () => makeMultisigProposal(overrides, rng));
}

export function makeMultisigSignatures(
  count: number,
  proposalId: string,
  overrides?: Partial<MultisigSignature>,
  rng?: Rng,
): MultisigSignature[] {
  return Array.from({ length: count }, () =>
    makeMultisigSignature(proposalId, overrides, rng),
  );
}
