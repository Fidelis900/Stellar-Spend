import { NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { getTransactionNotificationDeliveries } from '@/lib/notifications';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const deliveries = await getTransactionNotificationDeliveries(id);
    return NextResponse.json({ data: deliveries }, { status: 200 });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
