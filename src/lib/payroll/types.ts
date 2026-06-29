import type { RecurringFrequency } from "../recurring-transactions";

export interface PayrollRecipient {
    id: string;
    institution: string;
    accountIdentifier: string;
    accountName: string;
    currency: string;
    amount: string;
}

export interface PayrollTemplate {
    id: string;
    userAddress: string;
    name: string;
    description?: string;
    currency: string;
    cadence: RecurringFrequency;
    recipients: PayrollRecipient[];
    createdAt: number;
    updatedAt: number;
    paused: boolean;
    scheduleId?: string;
    totalAmount: string;
}

export type PayrollRunStatus =
    | "pending_approval"
    | "approved"
    | "rejected"
    | "executing"
    | "completed"
    | "partial_success"
    | "failed"
    | "expired";

export type RecipientDisbursementStatus = "pending" | "success" | "failed";

export interface RecipientDisbursement {
    recipientId: string;
    recipient: PayrollRecipient;
    status: RecipientDisbursementStatus;
    transactionId?: string;
    error?: string;
    attemptCount: number;
    timestamp?: number;
}

export interface PayrollRun {
    id: string;
    templateId: string;
    userAddress: string;
    templateSnapshot: PayrollTemplate;
    status: PayrollRunStatus;
    scheduledFor: number;
    createdAt: number;
    updatedAt: number;
    approvedAt?: number;
    approvedBy?: string;
    rejectedAt?: number;
    rejectedBy?: string;
    rejectionReason?: string;
    executedAt?: number;
    completedAt?: number;
    disbursements: RecipientDisbursement[];
    totalAmount: string;
    expiresAt?: number;
}
