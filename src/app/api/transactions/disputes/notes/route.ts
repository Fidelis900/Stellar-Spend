import { NextRequest, NextResponse } from 'next/server';
import { disputeRepository } from '@/lib/repositories/dispute-repository';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(req: NextRequest) {
  try {
    const authorId = req.headers.get('x-user-address') ?? req.headers.get('x-admin-id');
    if (!authorId) {
      return ErrorHandler.unauthorized('Authorization required');
    }

    const isAdmin = !!req.headers.get('x-admin-id');
    const { disputeId, content, isInternal } = await req.json();

    if (!disputeId || !content) {
      return ErrorHandler.validation('disputeId and content are required');
    }

    const dispute = await disputeRepository.getDispute(disputeId);
    if (!dispute) {
      return ErrorHandler.notFound("Dispute");
    }

    // Only admins can post internal notes
    const internal = isAdmin ? (isInternal ?? false) : false;

    const note = await disputeRepository.addNote(disputeId, authorId, content, internal);
    return NextResponse.json(note, { status: 201 });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to add note'));
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const disputeId = searchParams.get('disputeId');

    if (!disputeId) {
      return ErrorHandler.validation('disputeId is required');
    }

    const includeInternal = !!req.headers.get('x-admin-id');
    const disputeNotes = await disputeRepository.getNotes(disputeId, includeInternal);
    return NextResponse.json(disputeNotes);
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch notes'));
  }
}
