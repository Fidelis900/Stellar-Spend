/**
 * Multi-signature settlement coordinator (off-chain).
 *
 * Coordinates M-of-N co-signing for high-value release/upgrade actions.
 * Every signature collected is written to the audit log.
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { pool } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MultisigConfig {
  /** Minimum number of signatures required (M). */
  threshold: number;
  /** All registered signer addresses (N). */
  signers: string[];
  /**
   * Transfers above this USDC amount (in base units) require the full
   * threshold. Below it a single signer suffices.
   * Set to 0 to always require the full threshold.
   */
  highValueLimit: bigint;
}

export interface MultisigProposal {
  id: string;
  description: string;
  /** Target contract or settlement address. */
  target: string;
  /** Amount in token base units. */
  value: bigint;
  signatures: SignatureEntry[];
  executed: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface SignatureEntry {
  signer: string;
  signature: string;
  signedAt: number;
}

export type ProposalStatus =
  | { ready: false; collected: number; required: number }
  | { ready: true; collected: number; required: number };

// ── Service ───────────────────────────────────────────────────────────────────

export class MultisigSettlementService {
  private readonly config: MultisigConfig;
  /** Proposal TTL in milliseconds (default: 24 h). */
  private readonly proposalTtlMs: number;

  constructor(config: MultisigConfig, proposalTtlMs = 24 * 60 * 60 * 1000) {
    if (config.threshold < 1 || config.threshold > config.signers.length) {
      throw new Error(`Invalid threshold ${config.threshold} for ${config.signers.length} signers`);
    }
    this.config = config;
    this.proposalTtlMs = proposalTtlMs;
  }

  // ── Proposal lifecycle ────────────────────────────────────────────────────

  /**
   * Create a new proposal and record the proposer's implicit first signature.
   */
  async propose(
    proposer: string,
    description: string,
    target: string,
    value: bigint,
    signature: string,
  ): Promise<MultisigProposal> {
    this.assertIsSigner(proposer);

    const id = `prop_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + this.proposalTtlMs;

    const proposal: MultisigProposal = {
      id,
      description,
      target,
      value,
      signatures: [],
      executed: false,
      createdAt: now,
      expiresAt,
    };

    await this.persistProposal(proposal);

    // Record proposer's initial signature
    await this.recordSignature(proposal, proposer, signature);

    logger.info('multisig:proposed', {
      proposalId: id,
      proposer,
      target,
      value: value.toString(),
      threshold: this.requiredThreshold(value),
    });

    return this.getProposal(id) as Promise<MultisigProposal>;
  }

  /**
   * Add a signer's approval.  Emits an audit log entry for every signature.
   */
  async sign(proposalId: string, signer: string, signature: string): Promise<ProposalStatus> {
    this.assertIsSigner(signer);

    const proposal = await this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.executed) throw new Error('Proposal already executed');
    if (Date.now() > proposal.expiresAt) throw new Error('Proposal has expired');
    if (proposal.signatures.some((s) => s.signer === signer))
      throw new Error(`${signer} has already signed`);

    await this.recordSignature(proposal, signer, signature);

    const updated = (await this.getProposal(proposalId))!;
    const required = this.requiredThreshold(proposal.value);
    const collected = updated.signatures.length;

    logger.info('multisig:signed', {
      proposalId,
      signer,
      collected,
      required,
    });

    return { ready: collected >= required, collected, required };
  }

  /**
   * Execute a proposal once the quorum is reached.
   * Returns the approved value for the caller to act on.
   */
  async execute(proposalId: string, executor: string): Promise<bigint> {
    this.assertIsSigner(executor);

    const proposal = await this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.executed) throw new Error('Already executed');
    if (Date.now() > proposal.expiresAt) throw new Error('Proposal expired');

    const required = this.requiredThreshold(proposal.value);
    if (proposal.signatures.length < required) {
      throw new Error(`Quorum not met: ${proposal.signatures.length}/${required}`);
    }

    await pool.query(
      `UPDATE multisig_proposals SET executed = true, executed_by = $1, executed_at = $2 WHERE id = $3`,
      [executor, Date.now(), proposalId],
    );

    logger.info('multisig:executed', {
      proposalId,
      executor,
      value: proposal.value.toString(),
      signers: proposal.signatures.map((s) => s.signer),
    });

    return proposal.value;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getProposal(id: string): Promise<MultisigProposal | null> {
    const propRow = await pool.query(
      `SELECT id, description, target, value, executed, created_at, expires_at
       FROM multisig_proposals WHERE id = $1`,
      [id],
    );
    if (propRow.rows.length === 0) return null;

    const row = propRow.rows[0];
    const sigRows = await pool.query(
      `SELECT signer, signature, signed_at FROM multisig_signatures
       WHERE proposal_id = $1 ORDER BY signed_at ASC`,
      [id],
    );

    return {
      id: row.id,
      description: row.description,
      target: row.target,
      value: BigInt(row.value),
      executed: row.executed,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      signatures: sigRows.rows.map((s: Record<string, unknown>) => ({
        signer: s.signer as string,
        signature: s.signature as string,
        signedAt: Number(s.signed_at),
      })),
    };
  }

  getProposalStatus(proposal: MultisigProposal): ProposalStatus {
    const required = this.requiredThreshold(proposal.value);
    const collected = proposal.signatures.length;
    return { ready: collected >= required, collected, required };
  }

  requiredThreshold(value: bigint): number {
    if (this.config.highValueLimit > BigInt(0) && value <= this.config.highValueLimit) {
      return 1;
    }
    return this.config.threshold;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private assertIsSigner(address: string): void {
    if (!this.config.signers.includes(address)) {
      throw new Error(`${address} is not a registered signer`);
    }
  }

  private async persistProposal(proposal: MultisigProposal): Promise<void> {
    await pool.query(
      `INSERT INTO multisig_proposals
         (id, description, target, value, executed, created_at, expires_at)
       VALUES ($1, $2, $3, $4, false, $5, $6)`,
      [
        proposal.id,
        proposal.description,
        proposal.target,
        proposal.value.toString(),
        proposal.createdAt,
        proposal.expiresAt,
      ],
    );
  }

  private async recordSignature(
    proposal: MultisigProposal,
    signer: string,
    signature: string,
  ): Promise<void> {
    const entryId = `sig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    await pool.query(
      `INSERT INTO multisig_signatures (id, proposal_id, signer, signature, signed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [entryId, proposal.id, signer, signature, now],
    );

    // Structured audit log — every signature is permanently recorded
    logger.info('multisig:signature_collected', {
      auditEventType: 'MULTISIG_SIGNATURE',
      signatureId: entryId,
      proposalId: proposal.id,
      signer,
      target: proposal.target,
      value: proposal.value.toString(),
      signedAt: new Date(now).toISOString(),
    });
  }
}
