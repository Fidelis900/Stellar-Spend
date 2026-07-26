import { NextRequest, NextResponse } from 'next/server';
import { TwoFAService } from '@/lib/two-fa';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(req: NextRequest) {
  try {
    const adminId = req.headers.get('x-admin-id');
    if (!adminId) {
      return ErrorHandler.unauthorized('Admin authorization required');
    }

    const policy = TwoFAService.getEnforcementPolicy();
    return NextResponse.json(policy);
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch enforcement policy'));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminId = req.headers.get('x-admin-id');
    if (!adminId) {
      return ErrorHandler.unauthorized('Admin authorization required');
    }

    const updates = await req.json();
    const policy = TwoFAService.updateEnforcementPolicy(updates);
    return NextResponse.json(policy);
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to update enforcement policy'));
  }
}

// Enforce or unenforce 2FA for a specific user
export async function POST(req: NextRequest) {
  try {
    const adminId = req.headers.get('x-admin-id');
    if (!adminId) {
      return ErrorHandler.unauthorized('Admin authorization required');
    }

    const { userId, enforce } = await req.json();
    if (!userId || typeof enforce !== 'boolean') {
      return ErrorHandler.validation('userId and enforce (boolean) are required');
    }

    const result = enforce ? TwoFAService.enforce(userId) : TwoFAService.unenforce(userId);
    if (!result) {
      return ErrorHandler.handle(new ApiError(ErrorType.NOT_FOUND, '2FA not configured for this user'));
    }

    return NextResponse.json({ userId, isEnforced: enforce });
  } catch (error) {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to update enforcement'));
  }
}
