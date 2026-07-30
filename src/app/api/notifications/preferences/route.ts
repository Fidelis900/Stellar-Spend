import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('userAddress');
  if (!userAddress) {
    return ErrorHandler.validation('userAddress is required');
  }

  try {
    const preferences = await getNotificationPreferences(userAddress);
    return NextResponse.json({ data: preferences ?? null }, { status: 200 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const { userAddress } = body;
  if (!userAddress || typeof userAddress !== 'string') {
    return ErrorHandler.validation('userAddress is required');
  }

  try {
    const preferences = await upsertNotificationPreferences({
      userAddress,
      email: typeof body.email === 'string' ? body.email : undefined,
      phoneNumber: typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined,
      pushToken: typeof body.pushToken === 'string' ? body.pushToken : undefined,
      emailEnabled: body.emailEnabled !== false,
      smsEnabled: body.smsEnabled === true,
      pushEnabled: body.pushEnabled === true,
      notifyOnPending: body.notifyOnPending !== false,
      notifyOnCompleted: body.notifyOnCompleted !== false,
      notifyOnFailed: body.notifyOnFailed !== false,
      channelRouting:
        body.channelRouting && typeof body.channelRouting === 'object'
          ? (body.channelRouting as Record<string, string[]>)
          : undefined,
      locale: typeof body.locale === 'string' ? body.locale : undefined,
    });

    return NextResponse.json({ data: preferences }, { status: 200 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
