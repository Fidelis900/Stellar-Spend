import { NextRequest, NextResponse } from 'next/server';
import { getTransactionQueue, TransactionPriority } from '@/lib/priority-queue';
import { ErrorHandler } from '@/lib/error-handler';

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
  const { action, id, priority } = await req.json();

  if (!id) {
    return ErrorHandler.validation('Missing transaction id');
  }

  const queue = getTransactionQueue();

  if (action === 'remove') {
    const removed = queue.remove(id);
    if (!removed) return ErrorHandler.notFound('Transaction in queue');
    return NextResponse.json({ ok: true, action: 'removed', id });
  }

  if (action === 'override') {
    const priorityValue = Number(priority);
    if (!Object.values(TransactionPriority).includes(priorityValue)) {
      return ErrorHandler.validation(`Invalid priority. Valid values: ${Object.values(TransactionPriority).filter(v => typeof v === 'number').join(', ')}`);
    }
    const updated = queue.overridePriority(id, priorityValue as TransactionPriority);
    if (!updated) return ErrorHandler.notFound('Transaction in queue');
    return NextResponse.json({ ok: true, action: 'priority_overridden', id, priority: priorityValue });
  }

  return ErrorHandler.validation('Invalid action. Use "override" or "remove"');
}
