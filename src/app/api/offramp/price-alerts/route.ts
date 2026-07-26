import { NextRequest, NextResponse } from 'next/server';
import { AlertType, PriceAlert, PriceAlertStorage } from '@/lib/price-alerts';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

const VALID_ALERT_TYPES: AlertType[] = ['above', 'below'];

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.nextUrl.searchParams.get('userAddress');
    const analytics = req.nextUrl.searchParams.get('analytics');

    if (analytics === 'true') {
      const stats = PriceAlertStorage.getAnalytics();
      return NextResponse.json({ analytics: stats });
    }

    if (!userAddress) {
      return ErrorHandler.validation('Missing userAddress');
    }

    const alerts = PriceAlertStorage.getAlertsByUser(userAddress);
    return NextResponse.json({ alerts });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch price alerts'));
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { currency, targetPrice, alertType, userAddress, recurring } = body;

    if (!currency || targetPrice === undefined || !alertType) {
      return ErrorHandler.validation('Missing required fields');
    }

    if (!VALID_ALERT_TYPES.includes(alertType)) {
      return ErrorHandler.validation('Invalid alertType');
    }

    if (typeof targetPrice !== 'number' || targetPrice <= 0) {
      return ErrorHandler.validation('targetPrice must be a positive number');
    }

    const alertInput: Omit<PriceAlert, 'id' | 'createdAt' | 'triggeredAt' | 'notificationSent' | 'triggerHistory'> = {
      currency,
      targetPrice,
      alertType,
      status: 'active',
      triggeredCount: 0,
      recurring: recurring ?? false,
      userAddress,
    };

    const alert = PriceAlertStorage.createAlert(alertInput);
    return NextResponse.json({ alert }, { status: 201 });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to create price alert'));
  }
}
