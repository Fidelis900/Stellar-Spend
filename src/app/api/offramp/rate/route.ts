import { NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 10;

export async function GET() {
  try {
    const res = await fetch('https://api.paycrest.io/v1/rates/USDC/1/NGN?network=base', {
      next: { revalidate: 0 },
    });
    if (!res.ok) return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, 'unavailable'));
    const data = await res.json();
    const rate = parseFloat(data.rate ?? '0');
    if (!rate || rate <= 0) return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, 'invalid rate'));
    return NextResponse.json({ rate });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, 'unavailable'));
  }
}
