import { NextResponse, type NextRequest } from 'next/server';
import { replay, list, get } from '@/lib/webhook/dlq';
import { attempt } from '@/lib/webhook/dispatcher';
import { logger } from '@/lib/logger';
import { ErrorHandler } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entryId } = body;

    if (!entryId || typeof entryId !== 'string') {
      return ErrorHandler.validation('entryId is required');
    }

    const record = await replay(entryId);
    const result = await attempt(record);

    logger.info('dlq.replay', { entryId, deliveryId: record.id, success: result.success });

    return NextResponse.json({
      deliveryId: record.id,
      success: result.success,
      httpStatus: result.httpStatus,
      errorType: result.errorType,
    });
  } catch (err) {
    logger.error('dlq.replay_failed', {}, err);
    return ErrorHandler.serverError(err);
  }
}
