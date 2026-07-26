import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const adminId = req.headers.get('x-admin-id');
      if (!adminId) {
        return ErrorHandler.unauthorized('Admin authorization required');
      }

      const { disputeId, outcome, resolutionNotes } = await req.json();

      if (!disputeId || !outcome || !resolutionNotes) {
        return ErrorHandler.validation('disputeId, outcome, and resolutionNotes are required');
      }

      if (!['resolved', 'rejected'].includes(outcome)) {
        return ErrorHandler.validation("outcome must be 'resolved' or 'rejected'");
      }

      const dispute = await disputeRepository.getDispute(disputeId);
      if (!dispute) {
        return ErrorHandler.notFound("Dispute");
      }

      const resolved = await disputeRepository.resolveDispute(disputeId, outcome, resolutionNotes);

      return NextResponse.json(resolved);
    } catch (error) {
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}
