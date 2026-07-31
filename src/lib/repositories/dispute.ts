import { disputeRepository } from './dispute-repository';
import type { DisputeStatus } from '@shared/types/disputes';

export interface DisputeRecord {
  id: string;
  transactionId: string;
  userId: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  evidence: string[];
}

function toRecord(dispute: any): DisputeRecord {
  return {
    id: dispute.id,
    transactionId: dispute.transactionId,
    userId: dispute.userAddress,
    reason: dispute.reason,
    status: dispute.status,
    resolution: dispute.resolutionNotes ?? null,
    resolvedBy: dispute.assignedTo ?? null,
    createdAt: new Date(dispute.createdAt).toISOString(),
    updatedAt: new Date(dispute.updatedAt).toISOString(),
    resolvedAt: dispute.resolvedAt ? new Date(dispute.resolvedAt).toISOString() : null,
    evidence: [],
  };
}

export async function getDisputeById(id: string): Promise<DisputeRecord | null> {
  const dispute = await disputeRepository.getDispute(id);
  if (!dispute) return null;
  return toRecord(dispute);
}

export async function getDisputes(options: {
  status?: string;
  limit?: number;
}): Promise<DisputeRecord[]> {
  const disputes = await disputeRepository.listDisputes(
    options.status as DisputeStatus | undefined,
    options.limit,
  );
  return disputes.map(toRecord);
}

export async function createDispute(input: {
  transactionId: string;
  userId: string;
  reason: string;
  evidence?: string[];
}): Promise<DisputeRecord> {
  const dispute = await disputeRepository.createDispute(input.userId, {
    transactionId: input.transactionId,
    reason: input.reason,
    description: input.reason,
  });
  return toRecord(dispute);
}

export async function resolveDispute(
  id: string,
  resolution: string,
  resolvedBy: string,
): Promise<DisputeRecord> {
  const dispute = await disputeRepository.resolveDispute(id, 'resolved', resolution);
  if (!dispute) throw new Error(`Dispute ${id} not found`);
  const record = toRecord(dispute);
  record.resolvedBy = resolvedBy;
  return record;
}
