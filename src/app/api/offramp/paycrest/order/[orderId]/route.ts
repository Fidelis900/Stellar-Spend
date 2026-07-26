import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { ErrorHandler } from '@/lib/error-handler';

export const maxDuration = 10;

import { PaycrestAdapter, PaycrestHttpError } from '@/lib/offramp/adapters/paycrest-adapter';

/**
 * GET /api/offramp/paycrest/order/[orderId]
 * 
 * Fetches the status of a Paycrest payout order.
 * 
 * Path parameters:
 * - orderId: string (required)
 * 
 * Response:
 * {
 *   data: {
 *     status: string
 *     id: string
 *     ...
 *   }
 * }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params;

    if (!orderId || typeof orderId !== 'string') {
      return ErrorHandler.validation('orderId is required');
    }

    // Instantiate PaycrestAdapter
    const paycrest = new PaycrestAdapter(env.server.PAYCREST_API_KEY);

    // Get order status
    const order = await paycrest.getOrderStatus(orderId);

    return NextResponse.json({
      data: {
        status: order.status,
        id: order.id,
      },
    });
  } catch (err: unknown) {
    logger.error('Error fetching Paycrest order status:', {}, err);

    if (err instanceof PaycrestHttpError) {
      if (err.status === 404) {
        return ErrorHandler.notFound("Order");
      }
      return ErrorHandler.handle(err, err.status);
    }

    return ErrorHandler.serverError(err);
  }
}
