import { getRecordsByStatus } from '../../../../lib/webhook/delivery-store';
import { list as listDLQ, replay as replayDLQ } from '../../../../lib/webhook/dlq';
import { attempt, markDelivered, markFailed } from '../../../../lib/webhook/dispatcher';
import { hasRemainingAttempts, scheduleNext } from '../../../../lib/webhook/retry-scheduler';
import { updateRecord } from '../../../../lib/webhook/delivery-store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') ?? 'stats';

  try {
    if (view === 'dlq') {
      const entries = await listDLQ();
      return Response.json({ dlq: entries, count: entries.length });
    }

    if (view === 'deliveries') {
      const status = (searchParams.get('status') ?? 'pending') as
        | 'pending'
        | 'delivered'
        | 'failed';
      const records = await getRecordsByStatus(status);
      return Response.json({ deliveries: records, count: records.length });
    }

    // Default: stats dashboard
    const [pending, delivered, failed, dlq] = await Promise.all([
      getRecordsByStatus('pending'),
      getRecordsByStatus('delivered'),
      getRecordsByStatus('failed'),
      listDLQ(),
    ]);

    return Response.json({
      stats: {
        pending: pending.length,
        delivered: delivered.length,
        failed: failed.length,
        dlqCount: dlq.length,
      },
      recentFailures: failed.slice(0, 10).map((r) => ({
        id: r.id,
        destinationUrl: r.destinationUrl,
        attemptCount: r.attemptCount,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { action?: string; deliveryId?: string; dlqEntryId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, deliveryId, dlqEntryId } = body;

  try {
    if (action === 'replay' && dlqEntryId) {
      const record = await replayDLQ(dlqEntryId);
      return Response.json({ record });
    }

    if (action === 'retry' && deliveryId) {
      const records = await getRecordsByStatus('failed');
      const record = records.find((r) => r.id === deliveryId);
      if (!record) {
        return Response.json({ error: 'Delivery not found' }, { status: 404 });
      }
      // Reset to pending for next scheduler run
      const updated = await updateRecord(deliveryId, {
        status: 'pending',
        nextAttemptAt: new Date().toISOString(),
      });
      return Response.json({ record: updated });
    }

    if (action === 'attempt' && deliveryId) {
      const records = await getRecordsByStatus('pending');
      const record = records.find((r) => r.id === deliveryId);
      if (!record) {
        return Response.json({ error: 'Pending delivery not found' }, { status: 404 });
      }

      const result = await attempt(record);

      if (result.success) {
        await markDelivered(record.id, record.attemptCount + 1);
        return Response.json({ success: true, result });
      }

      if (result.retryable && hasRemainingAttempts(record)) {
        const scheduled = await scheduleNext(record);
        await updateRecord(record.id, { nextAttemptAt: scheduled.nextAttemptAt });
        return Response.json({ success: false, scheduled: true, result });
      }

      await markFailed(record);
      return Response.json({ success: false, scheduled: false, result });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
