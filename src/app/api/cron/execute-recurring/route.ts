import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import {
  RecurringSchedule,
  buildRecurringNotification,
} from '@/lib/recurring-transactions';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return ErrorHandler.unauthorized('Unauthorized');
    }

    const body = await req.json().catch(() => ({}));
    const dueSchedules: RecurringSchedule[] = body.schedules ?? [];

    if (!Array.isArray(dueSchedules)) {
      return ErrorHandler.validation('schedules must be an array');
    }

    const results: Array<{ id: string; status: 'success' | 'failed'; error?: string }> = [];
    const notifications: ReturnType<typeof buildRecurringNotification>[] = [];

    for (const schedule of dueSchedules) {
      try {
        // Execution logic: downstream services would process the offramp payment here.
        logger.info('recurring.execute', { scheduleId: schedule.id, userAddress: schedule.userAddress });

        results.push({ id: schedule.id, status: 'success' });

        if (schedule.notificationsEnabled) {
          notifications.push(buildRecurringNotification(schedule, 'success'));
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error('recurring.execute.failed', { scheduleId: schedule.id }, err);

        results.push({ id: schedule.id, status: 'failed', error });

        if (schedule.notificationsEnabled) {
          notifications.push(buildRecurringNotification(schedule, 'failed', error));
        }
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return NextResponse.json({
      processed: dueSchedules.length,
      succeeded,
      failed,
      results,
      notifications,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('cron.execute-recurring.failed', {}, err);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Cron job failed'));
  }
}
