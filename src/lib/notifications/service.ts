import { defaultAdapters } from '@/lib/notifications';
import {
  createNotificationDelivery,
  getNotificationDeliveriesForTransaction,
  retryNotificationDelivery,
} from '@/lib/notifications';
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/notifications';
import { buildNotificationTemplate, deriveNotificationEvent } from '@/lib/notifications/templates';
import type {
  ChannelAdapter,
  DeliveryResult,
  NotificationChannel,
  NotificationContext,
  NotificationPreferences,
  TransactionNotificationEvent,
} from '@/lib/notifications';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve which channels to fan out to for a given event, honouring per-event overrides first */
function resolveChannels(
  prefs: NotificationPreferences,
  event: TransactionNotificationEvent,
): NotificationChannel[] {
  // Per-event routing override takes precedence
  if (prefs.channelRouting?.[event]?.length) {
    return prefs.channelRouting[event]!;
  }
  // Fall back to per-channel enabled flags
  const channels: NotificationChannel[] = [];
  if (prefs.emailEnabled && prefs.email) channels.push('email');
  if (prefs.smsEnabled && prefs.phoneNumber) channels.push('sms');
  if (prefs.pushEnabled && prefs.pushToken) channels.push('push');
  return channels;
}

function destinationFor(
  channel: NotificationChannel,
  prefs: NotificationPreferences,
): string | undefined {
  if (channel === 'email') return prefs.email;
  if (channel === 'sms') return prefs.phoneNumber;
  if (channel === 'push') return prefs.pushToken;
  return undefined;
}

function shouldSendForEvent(
  prefs: NotificationPreferences,
  event: TransactionNotificationEvent,
): boolean {
  if (event === 'pending') return prefs.notifyOnPending;
  if (event === 'completed') return prefs.notifyOnCompleted;
  return prefs.notifyOnFailed;
}

async function attemptDelivery(
  adapter: ChannelAdapter,
  destination: string,
  subject: string,
  message: string,
): Promise<DeliveryResult> {
  let lastResult: DeliveryResult = { status: 'failed', errorMessage: 'No attempt made' };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await adapter.send(destination, subject, message).catch((err: unknown) => ({
      status: 'failed' as const,
      errorMessage: err instanceof Error ? err.message : String(err),
    }));
    if (lastResult.status !== 'failed') break;
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }
  return lastResult;
}

export async function getOrCreateNotificationPreferences(
  userAddress: string,
): Promise<NotificationPreferences> {
  const existing = await getNotificationPreferences(userAddress);
  if (existing) return existing;

  return upsertNotificationPreferences({
    userAddress,
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: false,
    notifyOnPending: true,
    notifyOnCompleted: true,
    notifyOnFailed: true,
  });
}

/**
 * Dispatch a notification event to all channels the user has enabled for that event.
 * Each delivery is logged; failed sends are retried up to MAX_ATTEMPTS times.
 */
export async function notifyTransactionStatusUpdate(
  context: NotificationContext,
  adapters: ChannelAdapter[] = defaultAdapters,
): Promise<void> {
  const event = deriveNotificationEvent(context);
  if (!event) return;

  const prefs = await getOrCreateNotificationPreferences(context.transaction.userAddress);
  if (!shouldSendForEvent(prefs, event)) return;

  const template = buildNotificationTemplate(context, prefs.locale);
  if (!template) return;

  const channels = resolveChannels(prefs, event);
  const adapterMap = new Map(adapters.map((a) => [a.channel, a]));

  await Promise.all(
    channels.map(async (channel) => {
      const adapter = adapterMap.get(channel);
      const destination = destinationFor(channel, prefs);

      if (!adapter || !destination) {
        await createNotificationDelivery({
          transactionId: context.transaction.id,
          userAddress: context.transaction.userAddress,
          eventType: event,
          channel,
          destination,
          status: 'skipped',
          templateId: template.templateId,
          subject: template.subject,
          message: template.message,
          attemptCount: 0,
          errorMessage: !adapter
            ? `No adapter for channel ${channel}`
            : 'No destination configured',
          metadata: { source: context.source },
        });
        return;
      }

      // First attempt
      let result = await adapter.send(destination, template.subject, template.message).catch(
        (err: unknown): DeliveryResult => ({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        }),
      );

      const record = await createNotificationDelivery({
        transactionId: context.transaction.id,
        userAddress: context.transaction.userAddress,
        eventType: event,
        channel,
        destination,
        status: result.status,
        templateId: template.templateId,
        subject: template.subject,
        message: template.message,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        attemptCount: 1,
        metadata: { source: context.source, payoutStatus: context.transaction.payoutStatus },
        sentAt: result.status === 'sent' ? Date.now() : undefined,
      });

      // Retry on failure
      if (result.status === 'failed') {
        for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
          await sleep(RETRY_DELAY_MS * (attempt - 1));
          result = await adapter.send(destination, template.subject, template.message).catch(
            (err: unknown): DeliveryResult => ({
              status: 'failed',
              errorMessage: err instanceof Error ? err.message : String(err),
            }),
          );
          await retryNotificationDelivery(record.id, result, attempt);
          if (result.status !== 'failed') break;
        }
      }
    }),
  );
}

export async function getTransactionNotificationDeliveries(transactionId: string) {
  return getNotificationDeliveriesForTransaction(transactionId);
}

export type { NotificationPreferences } from '@/lib/notifications';
