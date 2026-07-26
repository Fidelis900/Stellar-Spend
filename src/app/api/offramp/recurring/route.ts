import { NextRequest, NextResponse } from 'next/server';
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
      return NextResponse.json({ error: 'Missing userAddress' }, { status: 400 });
    }
    return NextResponse.json({ userAddress, schedules: [] });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch recurring schedules' }, { status: 500 });
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
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      if (!VALID_FREQUENCIES.includes(frequency)) {
        return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
      }

      if (!beneficiary.institution || !beneficiary.accountIdentifier || !beneficiary.accountName || !beneficiary.currency) {
        return NextResponse.json({ error: 'Invalid beneficiary' }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to create recurring schedule' }, { status: 500 });
    }
  }, { required: true });
}
