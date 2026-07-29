/**
 * Wrapper classes for function-based services
 * These wrap the existing free functions into classes that implement
 * the service interfaces, enabling DI container registration.
 */
import * as batchModule from './batch.service';
import * as referralModule from './referral.service';
import * as insuranceModule from './insurance.service';
import * as schedulingModule from './scheduling.service';

export class BatchServiceWrapper {
  createBatch(userId: string, totalAmount: number): Promise<Record<string, unknown>> {
    return batchModule.createBatch(userId, totalAmount);
  }
  addTransactionToBatch(
    batchId: string,
    transactionData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return batchModule.addTransactionToBatch(batchId, transactionData);
  }
  updateBatchTransactionStatus(
    batchTransactionId: string,
    status: string,
    transactionId?: string,
    errorMessage?: string,
  ): Promise<Record<string, unknown>> {
    return batchModule.updateBatchTransactionStatus(
      batchTransactionId,
      status,
      transactionId,
      errorMessage,
    );
  }
  getBatchStatus(batchId: string): Promise<Record<string, unknown>> {
    return batchModule.getBatchStatus(batchId);
  }
  getBatchProgress(batchId: string): Promise<Record<string, unknown>> {
    return batchModule.getBatchProgress(batchId);
  }
  completeBatch(batchId: string): Promise<Record<string, unknown>> {
    return batchModule.completeBatch(batchId);
  }
  cancelBatch(batchId: string): Promise<Record<string, unknown>> {
    return batchModule.cancelBatch(batchId);
  }
  executeBatch(
    batchId: string,
    handler: (txPayload: Record<string, unknown>) => Promise<string>,
  ): Promise<{ succeeded: number; failed: number; batchStatus: string }> {
    return batchModule.executeBatch(batchId, handler);
  }
  getBatchAnalytics(userId?: string): Promise<Record<string, unknown>> {
    return batchModule.getBatchAnalytics(userId);
  }
}

export class ReferralServiceWrapper {
  createReferralCode(userId: string, rewardAmount?: number): Promise<Record<string, unknown>> {
    return referralModule.createReferralCode(userId, rewardAmount);
  }
  getReferralCode(userId: string): Promise<Record<string, unknown>> {
    return referralModule.getReferralCode(userId);
  }
  trackReferral(referralCode: string, referredUserId: string): Promise<Record<string, unknown>> {
    return referralModule.trackReferral(referralCode, referredUserId);
  }
  getReferralStats(userId: string): Promise<Record<string, unknown>> {
    return referralModule.getReferralStats(userId);
  }
  calculateReward(baseReward: number, claimedCount: number): number {
    return referralModule.calculateReward(baseReward, claimedCount);
  }
  distributeReward(referralId: string): Promise<Record<string, unknown>> {
    return referralModule.distributeReward(referralId);
  }
  getReferralAnalytics(userId: string): Promise<Record<string, unknown>> {
    return referralModule.getReferralAnalytics(userId);
  }
  getReferralLeaderboard(limit?: number): Promise<Record<string, unknown>[]> {
    return referralModule.getReferralLeaderboard(limit);
  }
  detectReferralFraud(
    userId: string,
    referralCode: string,
  ): Promise<{ suspicious: boolean; reasons: string[] }> {
    return referralModule.detectReferralFraud(userId, referralCode);
  }
}

export class InsuranceServiceWrapper {
  calculateInsurancePremium(amount: number, currency: string): Promise<Record<string, unknown>> {
    return insuranceModule.calculateInsurancePremium(amount, currency);
  }
  createInsurance(
    transactionId: string,
    premium: number,
    coverage: number,
    provider: string,
  ): Promise<Record<string, unknown>> {
    return insuranceModule.createInsurance(transactionId, premium, coverage, provider);
  }
  getInsuranceStatus(transactionId: string): Promise<Record<string, unknown>> {
    return insuranceModule.getInsuranceStatus(transactionId);
  }
  getInsuranceById(insuranceId: string): Promise<Record<string, unknown>> {
    return insuranceModule.getInsuranceById(insuranceId);
  }
  fileClaim(
    insuranceId: string,
    reason: string,
    evidence?: string,
  ): Promise<Record<string, unknown>> {
    return insuranceModule.fileClaim(insuranceId, reason, evidence);
  }
  verifyClaim(insuranceId: string): Promise<{ valid: boolean; reason?: string }> {
    return insuranceModule.verifyClaim(insuranceId);
  }
  approveClaim(insuranceId: string): Promise<Record<string, unknown>> {
    return insuranceModule.approveClaim(insuranceId);
  }
  rejectClaim(insuranceId: string, rejectionReason: string): Promise<Record<string, unknown>> {
    return insuranceModule.rejectClaim(insuranceId, rejectionReason);
  }
  processInsurancePayout(insuranceId: string): Promise<Record<string, unknown>> {
    return insuranceModule.processInsurancePayout(insuranceId);
  }
  getInsuranceAnalytics(): Promise<Record<string, unknown>> {
    return insuranceModule.getInsuranceAnalytics();
  }
}

export class SchedulingServiceWrapper {
  scheduleTransaction(
    userId: string,
    amount: number,
    currency: string,
    scheduledFor: Date,
  ): Promise<Record<string, unknown>> {
    return schedulingModule.scheduleTransaction(userId, amount, currency, scheduledFor);
  }
  getScheduledTransactions(userId: string): Promise<Record<string, unknown>[]> {
    return schedulingModule.getScheduledTransactions(userId);
  }
  getPendingScheduledTransactions(): Promise<Record<string, unknown>[]> {
    return schedulingModule.getPendingScheduledTransactions();
  }
  executeScheduledTransaction(
    scheduledId: string,
    transactionId: string,
  ): Promise<Record<string, unknown>> {
    return schedulingModule.executeScheduledTransaction(scheduledId, transactionId);
  }
  cancelScheduledTransaction(scheduledId: string): Promise<Record<string, unknown>> {
    return schedulingModule.cancelScheduledTransaction(scheduledId);
  }
  updateScheduledTransaction(
    scheduledId: string,
    scheduledFor: Date,
  ): Promise<Record<string, unknown>> {
    return schedulingModule.updateScheduledTransaction(scheduledId, scheduledFor);
  }
}
