import { randomUUID } from 'crypto';
import { eventBus } from '@/lib/events/bus';
import { getSubscriptionsByEvent } from './subscription-store';
import { enqueue, attempt, markDelivered, markFailed } from './dispatcher';
import { logDelivery } from './delivery-log';
import { subscriptionRateLimiter } from './subscription-rate-limiter';
import { scheduleNext, hasRemainingAttempts } from './retry-scheduler';
import { updateRecord } from './delivery-store';
import type { WebhookEvent } from './subscription-types';
import { buildPayloadForVersion, DEFAULT_SCHEMA_VERSION } from './schema-versions';
import { logger } from '@/lib/logger';

export function subscribeEventBus() {
  const events: WebhookEvent[] = [
    'transaction.created',
    'transaction.completed',
    'transaction.failed',
    'payout.initiated',
    'payout.completed',
    'payout.failed',
    'bridge.initiated',
    'bridge.completed',
  ];

  for (const event of events) {
    eventBus.on(event, async (eventData) => {
      try {
        const subscriptions = await getSubscriptionsByEvent(event);
        if (subscriptions.length === 0) return;

        const eventId = randomUUID();

        for (const sub of subscriptions) {
          const rateCheck = await subscriptionRateLimiter.check(sub.id, sub.rateLimitMaxPerMinute);
          if (!rateCheck.allowed) {
            logger.warn('webhook.rate_limited', {
              subscriptionId: sub.id,
              event,
              endpointUrl: sub.endpointUrl,
            });
            continue;
          }

          const payload = buildPayloadForVersion(
            { event, id: eventId, timestamp: eventData.timestamp, data: eventData.data },
            sub.schemaVersion ?? DEFAULT_SCHEMA_VERSION
          );
          const payloadBody = JSON.stringify(payload);

          const record = await enqueue(
            { headers: {}, body: payloadBody, source: 'event-bus' },
            sub.endpointUrl
          );

          const result = await attempt(record, sub.signingSecret);

          await logDelivery({
            subscriptionId: sub.id,
            event,
            payloadUrl: sub.endpointUrl,
            requestBody: payloadBody,
            responseStatus: result.httpStatus ?? null,
            responseBody: null,
            durationMs: result.durationMs,
            status: result.success ? 'delivered' : 'failed',
            attemptCount: 1,
          });

          if (result.success) {
            await markDelivered(record.id, 1);
          } else if (!result.retryable) {
            await markFailed(record);
          } else {
            const scheduled = await scheduleNext(record);
            await updateRecord(record.id, {
              nextAttemptAt: scheduled.nextAttemptAt as unknown as string | null,
            });
          }
        }
      } catch (err) {
        logger.error('webhook.event_dispatch_error', {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}
