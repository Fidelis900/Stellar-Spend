import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { QRCodeData } from '@/types/qrcode';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function POST(req: NextRequest) {
  try {
    const { transactionId, data }: { transactionId: string; data: QRCodeData } =
      await req.json();

    if (!transactionId || !data) {
      return ErrorHandler.validation('Transaction ID and data are required');
    }

    const svc = await globalContainer.resolve(SERVICE_KEYS.QRCODE_SERVICE);
    const qrCode = await svc.createQRCode(transactionId, data);

    return NextResponse.json(qrCode, { status: 201 });
  } catch (error) {
    logger.error('Error creating QR code:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to create QR code'));
  }
}

export async function GET(req: NextRequest) {
  try {
    const transactionId = req.nextUrl.searchParams.get('transactionId');
    const format = (req.nextUrl.searchParams.get('format') || 'svg') as 'svg' | 'png';

    if (!transactionId) {
      return ErrorHandler.validation('Transaction ID required');
    }

    const svc = await globalContainer.resolve(SERVICE_KEYS.QRCODE_SERVICE);
    const qrCode = await svc.getQRCode(transactionId);

    if (!qrCode) {
      return ErrorHandler.notFound("QR code");
    }

    // If requesting SVG format, return as SVG
    if (format === 'svg') {
      const data = svc.parseQRData(qrCode.qrData);
      if (!data) {
        return ErrorHandler.validation('Invalid QR data');
      }

      const svg = svc.generateSVGPattern(qrCode.qrData, 200);
      return new NextResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }

    return NextResponse.json(qrCode);
  } catch (error) {
    logger.error('Error fetching QR code:', {}, error);
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch QR code'));
  }
}
