import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { CreateDisputeRequest } from '@/types/disputes';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const userAddress = req.headers.get('x-user-address');
      if (!userAddress) {
        return NextResponse.json({ error: 'User address required' }, { status: 401 });
      }

      const body: CreateDisputeRequest = await req.json();

      if (!body.transactionId || !body.reason) {
        return NextResponse.json(
          { error: 'Transaction ID and reason are required' },
          { status: 400 }
        );
      }

      const dispute = await disputeRepository.createDispute(userAddress, body);

      return NextResponse.json(dispute, { status: 201 });
    } catch (error) {
      logger.error('Error creating dispute:', {}, error);
      return NextResponse.json(
        { error: 'Failed to create dispute' },
        { status: 500 }
      );
    }
  }, { required: true });
}

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.headers.get('x-user-address');
    if (!userAddress) {
      return NextResponse.json({ error: 'User address required' }, { status: 401 });
    }

    const disputes = await disputeRepository.getDisputesByUser(userAddress);

    return NextResponse.json(disputes);
  } catch (error) {
    logger.error('Error fetching disputes:', {}, error);
    return NextResponse.json(
      { error: 'Failed to fetch disputes' },
      { status: 500 }
    );
  }
}
