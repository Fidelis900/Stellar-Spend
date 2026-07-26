import { NextResponse, type NextRequest } from 'next/server';
import { dal, DatabaseError } from '@/lib/db/dal';
import { ErrorHandler } from '@/lib/error-handler';
import { withIdempotency } from '@/lib/idempotency';
import { notifyTransactionStatusUpdate } from '@/lib/notifications/service';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return withIdempotency(request, async () => {
        const { id } = await params;

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return ErrorHandler.validation('Invalid JSON body');
        }

        try {
            const existing = await dal.getById(id);
            if (!existing) {
                return ErrorHandler.notFound('transaction');
            }

            await dal.update(id, body);

            const updated = await dal.getById(id);
            if (updated) {
                await notifyTransactionStatusUpdate({
                    transaction: updated,
                    previousStatus: existing.status,
                    previousPayoutStatus: existing.payoutStatus,
                    source: 'manual_update',
                });
            }
            return NextResponse.json(updated, { status: 200 });
        } catch (err) {
            if (err instanceof DatabaseError) {
                return ErrorHandler.serverError(err);
            }
            return ErrorHandler.serverError(err);
        }
    }, { required: true });
}
