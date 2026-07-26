import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { DisputeEscalation } from '@/types/disputes';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const userAddress = req.headers.get('x-user-address');
      if (!userAddress) {
        return ErrorHandler.unauthorized('User address required');
      }

      const { disputeId, reason, priority } = await req.json();

      if (!disputeId || !reason) {
        return ErrorHandler.validation('disputeId and reason are required');
      }

      const dispute = await disputeRepository.getDispute(disputeId);
      if (!dispute) {
        return ErrorHandler.notFound("Dispute");
      }

      if (dispute.userAddress !== userAddress) {
        return ErrorHandler.forbidden('Forbidden');
      }

      const escalated = await disputeRepository.escalateDispute(
        disputeId,
        userAddress,
        reason,
        priority as DisputeEscalation['priority'],
      );

      return NextResponse.json(escalated);
    } catch (error) {
      return ErrorHandler.serverError(error);
    }
  }, { required: true });
}
