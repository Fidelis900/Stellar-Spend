import { NextRequest, NextResponse } from 'next/server';
import { getTransactionQueue, TransactionPriority } from '@/lib/priority-queue';
import { ErrorHandler } from '@/lib/error-handler';
import { queueManageSchema, formatZodErrors } from '@/lib/validators';
import { ApiError, ErrorType } from '@/lib/error-types';

/**
 * GET /api/queue/manage
 * Returns the full queue snapshot (admin monitoring dashboard).
 */
export async function GET() {
  const queue = getTransactionQueue();
  return NextResponse.json({
    depth: queue.size(),
    metrics: queue.getMetrics(),
    items: queue.getAll(),
  });
}

/**
 * POST /api/queue/manage
 * Admin actions: override priority or remove a transaction.
 *
 * Body: { action: 'override', id: string, priority: number }
 *       { action: 'remove', id: string }
 */
export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const parsed = queueManageSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = formatZodErrors(parsed.error);
    return ErrorHandler.handle(
      new ApiError(ErrorType.VALIDATION, errors[0].message, 400, { errors }),
    );
  }

  const queue = getTransactionQueue();
  const data = parsed.data;

  if (data.action === 'remove') {
    const removed = queue.remove(data.id);
    if (!removed) return ErrorHandler.notFound('Transaction in queue');
    return NextResponse.json({ ok: true, action: 'removed', id: data.id });
  }

  if (data.action === 'override') {
    const priorityValue = data.priority as TransactionPriority;
    if (!Object.values(TransactionPriority).includes(priorityValue)) {
      return ErrorHandler.validation(
        `Invalid priority. Valid values: ${Object.values(TransactionPriority)
          .filter((v) => typeof v === 'number')
          .join(', ')}`,
      );
    }
    const updated = queue.overridePriority(data.id, priorityValue);
    if (!updated) return ErrorHandler.notFound('Transaction in queue');
    return NextResponse.json({
      ok: true,
      action: 'priority_overridden',
      id: data.id,
      priority: priorityValue,
    });
  }

  // Exhaustive — discriminated union ensures we only land here on unknown action
  return ErrorHandler.validation('Invalid action. Use "override" or "remove"');
}
