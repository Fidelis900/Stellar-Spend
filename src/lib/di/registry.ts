/**
 * Service Registry - Pre-configured services for the application
 * All services should be registered here for consistent DI wiring.
 */

import { DIContainer, ServiceLifetime } from './container';
import type {
  IQuoteService,
  IBridgeService,
  IPayoutService,
  IWebhookService,
  ITransactionService,
  ISharingService,
  IAnalyticsService,
  IQRCodeService,
  IOnrampService,
  IReferralService,
  ISchedulingService,
  IInsuranceService,
  IBatchService,
} from '@/lib/services/interfaces';
import {
  BatchServiceWrapper,
  ReferralServiceWrapper,
  InsuranceServiceWrapper,
  SchedulingServiceWrapper,
} from '@/lib/services/wrapper-services';
import { QuoteService } from '@/lib/services/quote.service';
import { BridgeService } from '@/lib/services/bridge.service';
import { PayoutService } from '@/lib/services/payout.service';
import { WebhookService } from '@/lib/services/webhook.service';
import { TransactionService } from '@/lib/services/transaction.service';
import { SharingService } from '@/lib/services';
import { AnalyticsService } from '@/lib/services/analytics-service';
import { QRCodeService } from '@/lib/services/qrcode-service';
import { OnrampService } from '@/lib/services/onramp.service';

export const SERVICE_KEYS = {
  QUOTE_SERVICE: 'QuoteService',
  BRIDGE_SERVICE: 'BridgeService',
  PAYOUT_SERVICE: 'PayoutService',
  WEBHOOK_SERVICE: 'WebhookService',
  TRANSACTION_SERVICE: 'TransactionService',
  SHARING_SERVICE: 'SharingService',
  ANALYTICS_SERVICE: 'AnalyticsService',
  QRCODE_SERVICE: 'QRCodeService',
  ONRAMP_SERVICE: 'OnrampService',
  REFERRAL_SERVICE: 'ReferralService',
  SCHEDULING_SERVICE: 'SchedulingService',
  INSURANCE_SERVICE: 'InsuranceService',
  BATCH_SERVICE: 'BatchService',
} as const;

/**
 * Configure the DI container with all application services
 */
export function configureServices(container: DIContainer): void {
  container.registerSingleton<IQuoteService>(SERVICE_KEYS.QUOTE_SERVICE, () => new QuoteService());
  container.registerSingleton<IBridgeService>(
    SERVICE_KEYS.BRIDGE_SERVICE,
    () => new BridgeService(),
  );
  container.registerSingleton<IPayoutService>(
    SERVICE_KEYS.PAYOUT_SERVICE,
    () => new PayoutService(),
  );
  container.registerSingleton<IWebhookService>(
    SERVICE_KEYS.WEBHOOK_SERVICE,
    () => new WebhookService(),
  );
  container.registerSingleton<ITransactionService>(
    SERVICE_KEYS.TRANSACTION_SERVICE,
    () => new TransactionService(),
  );
  container.registerSingleton<ISharingService>(
    SERVICE_KEYS.SHARING_SERVICE,
    () => new SharingService(),
  );
  container.registerSingleton<IAnalyticsService>(
    SERVICE_KEYS.ANALYTICS_SERVICE,
    () => new AnalyticsService(),
  );
  container.registerSingleton<IQRCodeService>(
    SERVICE_KEYS.QRCODE_SERVICE,
    () => new QRCodeService(),
  );
  container.registerSingleton<IOnrampService>(
    SERVICE_KEYS.ONRAMP_SERVICE,
    () => new OnrampService(),
  );
  container.registerSingleton<IReferralService>(
    SERVICE_KEYS.REFERRAL_SERVICE,
    () => new ReferralServiceWrapper(),
  );
  container.registerSingleton<ISchedulingService>(
    SERVICE_KEYS.SCHEDULING_SERVICE,
    () => new SchedulingServiceWrapper(),
  );
  container.registerSingleton<IInsuranceService>(
    SERVICE_KEYS.INSURANCE_SERVICE,
    () => new InsuranceServiceWrapper(),
  );
  container.registerSingleton<IBatchService>(
    SERVICE_KEYS.BATCH_SERVICE,
    () => new BatchServiceWrapper(),
  );
}

/**
 * Register a mock/override for testing. After calling this,
 * container.resolve(key) will return the mock instance instead.
 * Clears any cached singleton instance so the override takes effect.
 */
export function overrideService<T>(container: DIContainer, key: string, mock: T): void {
  container.registerOverride<T>(key, mock);
}

/**
 * Get a service from the container
 */
export async function getService<T>(
  container: DIContainer,
  key: string,
  scopeId?: string,
): Promise<T> {
  return container.resolve<T>(key, scopeId);
}

/**
 * Get a service synchronously (for non-async factories)
 */
export function getServiceSync<T>(container: DIContainer, key: string, scopeId?: string): T {
  return container.resolveSync<T>(key, scopeId);
}

/**
 * Validate all services in the container
 */
export async function validateServices(container: DIContainer): Promise<void> {
  const result = await container.validate();
  if (!result.valid) {
    throw new Error(`DI validation failed:\n${result.errors.join('\n')}`);
  }
}
