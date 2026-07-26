import { NextResponse, type NextRequest } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
    const status = await svc.getOrderStatus(orderId);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return ErrorHandler.handle(new ApiError(ErrorType.NOT_FOUND, message));
    }
    return ErrorHandler.serverError(error);
  }
}
