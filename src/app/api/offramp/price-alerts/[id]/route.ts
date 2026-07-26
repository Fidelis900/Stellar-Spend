import { NextRequest, NextResponse } from 'next/server';
import { PriceAlertStorage } from '@/lib/price-alerts';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const history = req.nextUrl.searchParams.get('history') === 'true';
    const alert = PriceAlertStorage.getAlert(params.id);
    if (!alert) return ErrorHandler.notFound("Alert");

    if (history) {
      return NextResponse.json({ history: alert.triggerHistory ?? [] });
    }
    return NextResponse.json({ alert });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch alert'));
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { action, ...updates } = body;

    if (action === 'activate') {
      const updated = PriceAlertStorage.updateAlert(params.id, {
        status: 'active',
        notificationSent: false,
      });
      if (!updated) return ErrorHandler.notFound("Alert");
      return NextResponse.json({ alert: updated });
    }

    if (action === 'deactivate') {
      const updated = PriceAlertStorage.updateAlert(params.id, { status: 'inactive' });
      if (!updated) return ErrorHandler.notFound("Alert");
      return NextResponse.json({ alert: updated });
    }

    const updated = PriceAlertStorage.updateAlert(params.id, updates);
    if (!updated) return ErrorHandler.notFound("Alert");
    return NextResponse.json({ alert: updated });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to update alert'));
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const deleted = PriceAlertStorage.deleteAlert(params.id);
    if (!deleted) return ErrorHandler.notFound("Alert");
    return NextResponse.json({ deleted: params.id });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to delete alert'));
  }
}
