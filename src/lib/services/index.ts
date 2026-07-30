/**
 * Service layer exports
 * Services are instantiated via the DI container, not as module-level singletons.
 * Use `container.resolve()` or the helper in '@/lib/di' to obtain service instances.
 */

export * from './interfaces';
export { QuoteService } from './quote.service';
export { BridgeService } from './bridge.service';
export { PayoutService } from './payout.service';
export { WebhookService } from './webhook.service';
export { TransactionService } from './transaction.service';
export { SharingService } from './sharing-service';
export { AnalyticsService } from './analytics-service';
export { QRCodeService } from './qrcode-service';
export { OnrampService } from './onramp.service';
export { BatchServiceWrapper as BatchService } from './wrapper-services';
export { ReferralServiceWrapper as ReferralService } from './wrapper-services';
export { InsuranceServiceWrapper as InsuranceService } from './wrapper-services';
export { SchedulingServiceWrapper as SchedulingService } from './wrapper-services';
export * from './batch.service';
export * from './referral.service';
export * from './insurance.service';
export * from './scheduling.service';
export { StellarSwapService, stellarSwapService } from './stellar-swap.service';
export type { StellarSwapQuote } from './stellar-swap.service';
