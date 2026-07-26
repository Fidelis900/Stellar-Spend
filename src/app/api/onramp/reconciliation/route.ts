import { NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return ErrorHandler.validation('orderId is required');
    }

    const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
    await svc.reconciliate(orderId);

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
