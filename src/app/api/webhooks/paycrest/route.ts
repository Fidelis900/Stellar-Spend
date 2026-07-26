import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { ErrorHandler } from '@/lib/error-handler';
import { generateRequestId, createRequestLogger } from '@/lib/offramp/utils/logger';
import { mapPaycrestStatus } from '@/lib/offramp/utils/mapPaycrestStatus';
import { dal, DatabaseError } from '@/lib/db/dal';
import { enqueue } from '@/lib/webhook/dispatcher';
import { verifyWebhookSignature, createNonceTable } from '@/lib/webhookVerify';
import { notifyTransactionStatusUpdate } from '@/lib/notifications/service';
import { withIdempotency } from '@/lib/idempotency';
import { logger } from '@/lib/logger';
import type { NextRequest } from 'next/server';

const SENSITIVE_HEADERS = new Set(['authorization', 'x-paycrest-signature']);

function redactHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  });
  return result;
}

export const maxDuration = 10;

async function handleWebhook(request: NextRequest): Promise<NextResponse> {
  await createNonceTable().catch(() => {});

  const requestId = generateRequestId();
  const reqLogger = createRequestLogger(requestId, 'POST', '/api/webhooks/paycrest');

  const rawBody = await request.text();
  const signature = request.headers.get('X-Paycrest-Signature') ?? '';
  const timestamp = request.headers.get('X-Paycrest-Timestamp');
  const nonce = request.headers.get('X-Paycrest-Nonce');

  if (!signature || !timestamp || !nonce) {
    logger.warn('webhook.missing_headers', { requestId, hasSignature: !!signature, hasTimestamp: !!timestamp, hasNonce: !!nonce });
    reqLogger.logError(401, 'Missing required webhook headers');
    return ErrorHandler.unauthorized('Missing required security headers');
  }

  const verification = await verifyWebhookSignature(
    rawBody,
    signature,
    env.server.PAYCREST_WEBHOOK_SECRET,
    timestamp,
    nonce,
  );

  if (!verification.valid) {
    reqLogger.logError(401, verification.reason ?? 'Invalid signature');
    return ErrorHandler.unauthorized(verification.reason ?? 'Invalid signature');
  }

  enqueue(
    {
      headers: redactHeaders(request.headers),
      body: rawBody,
      source: 'paycrest',
    },
    '/api/webhooks/paycrest/process',
  ).catch((err) => {
    logger.error('webhook.enqueue_failed', { requestId }, err);
  });

  try {
    const payload = JSON.parse(rawBody);
    const eventType: string = payload?.event ?? '';
    const orderId: string = payload?.data?.id ?? payload?.data?.orderId ?? '';

    logger.info('webhook.event_received', { requestId, eventType, orderId });

    const transaction = await dal.getByPayoutOrderId(orderId);
    if (!transaction) {
      logger.info('webhook.no_transaction', { requestId, orderId });
      reqLogger.logSuccess(200);
      return NextResponse.json({ received: true, orderId });
    }

    let updates: Record<string, unknown> | null = null;
    if (eventType === 'payment_order.settled') {
      updates = { status: 'completed', payoutStatus: 'settled' };
    } else if (eventType === 'payment_order.pending') {
      updates = { payoutStatus: 'pending' };
    } else if (eventType === 'payment_order.refunded') {
      updates = { status: 'failed', payoutStatus: 'refunded', error: 'Refunded by Paycrest' };
    } else if (eventType === 'payment_order.expired') {
      updates = { status: 'failed', payoutStatus: 'expired', error: 'Order expired' };
    } else {
      logger.warn('webhook.unhandled_event', { requestId, eventType });
    }

    if (updates) {
      await dal.update(transaction.id, updates);
      const updated = await dal.getById(transaction.id);
      if (updated) {
        await notifyTransactionStatusUpdate({
          transaction: updated,
          previousStatus: transaction.status,
          previousPayoutStatus: transaction.payoutStatus,
          source: 'webhook',
        });
      }
    }

    reqLogger.logSuccess(200);
    return NextResponse.json({ received: true });
  } catch (err) {
    if (err instanceof DatabaseError) {
      reqLogger.logError(500, err.message);
      return ErrorHandler.serverError(err);
    }
    reqLogger.logError(400, 'Failed to parse webhook payload');
    return ErrorHandler.validation('Malformed JSON payload');
  }
}

export async function POST(request: NextRequest) {
  return withIdempotency(request, () => handleWebhook(request));
}
