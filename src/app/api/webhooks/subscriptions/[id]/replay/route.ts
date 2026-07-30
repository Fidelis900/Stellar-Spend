import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { getDeliveryLogById } from '@/lib/webhook';
import { enqueue } from '@/lib/webhook';
import { getSubscription } from '@/lib/webhook';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  let body: { deliveryLogId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    if (body.deliveryLogId) {
      const log = await getDeliveryLogById(body.deliveryLogId);
      if (!log) return ErrorHandler.notFound('Delivery log entry');
      if (log.subscriptionId !== id) {
        return ErrorHandler.validation('Delivery log does not belong to this subscription');
      }

      const record = await enqueue(
        { headers: {}, body: log.requestBody, source: 'replay' },
        log.payloadUrl,
      );

      return NextResponse.json({
        data: { deliveryId: record.id, status: record.status, replayedLogId: log.id },
      });
    }

    const subscription = await getSubscription(id);
    if (!subscription) return ErrorHandler.notFound('Subscription');
    if (subscription.status !== 'active') {
      return ErrorHandler.validation('Subscription is not active');
    }

    return NextResponse.json({
      data: { message: 'Provide deliveryLogId to replay a specific delivery' },
    });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
