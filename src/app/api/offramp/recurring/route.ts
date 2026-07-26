import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import {
  RecurringSchedule,
  RecurringFrequency,
  computeNextRunAt,
} from '@/lib/recurring-transactions';
import crypto from 'crypto';
import { withIdempotency } from '@/lib/idempotency';

const VALID_FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'monthly'];

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.nextUrl.searchParams.get('userAddress');
    if (!userAddress) {
      return ErrorHandler.validation('Missing userAddress');
    }
    return NextResponse.json({ userAddress, schedules: [] });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch recurring schedules'));
  }
}

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    try {
      const body = await req.json();
      const {
        userAddress,
        label,
        amount,
        currency,
        frequency,
        beneficiary,
        maxExecutions,
        retryConfig,
        notificationsEnabled,
      } = body;

      if (!userAddress || !label || !amount || !currency || !frequency || !beneficiary) {
        return ErrorHandler.validation('Missing required fields');
      }

      if (!VALID_FREQUENCIES.includes(frequency)) {
        return ErrorHandler.validation('Invalid frequency');
      }

      if (!beneficiary.institution || !beneficiary.accountIdentifier || !beneficiary.accountName || !beneficiary.currency) {
        return ErrorHandler.validation('Invalid beneficiary');
      }

      const now = Date.now();
      const schedule: RecurringSchedule = {
        id: `rec_${crypto.randomUUID()}`,
        createdAt: now,
        userAddress,
        label,
        amount: String(amount),
        currency,
        frequency,
        beneficiary,
        nextRunAt: computeNextRunAt(now, frequency),
        paused: false,
        executionCount: 0,
        maxExecutions: maxExecutions ?? undefined,
        retryConfig: retryConfig ?? { maxRetries: 3, retryIntervalMs: 3_600_000, currentRetryCount: 0 },
        executionHistory: [],
        notificationsEnabled: notificationsEnabled ?? true,
      };

      return NextResponse.json({ schedule }, { status: 201 });
    } catch {
      return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to create recurring schedule'));
    }
  }, { required: true });
}
