import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { paycrestOrderLimiter, getClientIp } from '@/lib/offramp';
import { generateRequestId, createRequestLogger } from '@/lib/offramp';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import { paycrestOrderRouteSchema, formatZodErrors } from '@/lib/validators';

export const maxDuration = 20;

import { PayoutOrderRequest } from '@/lib/offramp';

import { PaycrestAdapter, PaycrestHttpError } from '@/lib/offramp';

function withRequestId<T>(response: NextResponse<T>, requestId: string): NextResponse<T> {
  response.headers.set('X-Request-Id', requestId);
  return response;
}

/**
 * POST /api/offramp/paycrest/order
 *
 * Creates a Paycrest payout order.
 *
 * Request body:
 * {
 *   amount: number (required, > 0)
 *   rate: number (required, > 0)
 *   token: string (required, e.g., 'USDC')
 *   network: string (required, e.g., 'stellar')
 *   reference: string (required)
 *   returnAddress: string (required)
 *   recipient: {
 *     institution: string (required)
 *     accountIdentifier: string (required)
 *     accountName: string (required)
 *     currency: string (required)
 *   }
 * }
 *
 * Response:
 * {
 *   data: {
 *     id: string
 *     receiveAddress: string
 *     ...
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    const requestId = generateRequestId();
    const clientIp = getClientIp(req);
    const logger = createRequestLogger(requestId, 'POST', '/api/offramp/paycrest/order');

    try {
      // Check rate limit
      const rateLimitCheck = await paycrestOrderLimiter.check(clientIp);
      if (!rateLimitCheck.allowed) {
        logger.logError(429, 'Rate limit exceeded');
        const res = withRequestId(ErrorHandler.rateLimit('Too many requests', rateLimitCheck.retryAfter), requestId);
        res.headers.set('Retry-After', String(rateLimitCheck.retryAfter));
        return res;
      }

      const rawBody = await req.json();

      const zodResult = paycrestOrderRouteSchema.safeParse(rawBody);
      if (!zodResult.success) {
        const errors = formatZodErrors(zodResult.error);
        logger.logError(400, 'Validation failed');
        return withRequestId(
          ErrorHandler.handle(new ApiError(ErrorType.VALIDATION, errors[0].message, 400, { errors })),
          requestId,
        );
      }

      const { amount, rate, token, network, reference, returnAddress, recipient } = zodResult.data;
      const normalizedAmount = Math.floor(amount * 1e6) / 1e6;
      const normalizedRate = Number(rate.toFixed(6));

      logger.debug('[paycrest/order] amount normalization', {
        normalized: { amount: normalizedAmount, rate: normalizedRate },
      });

      const paycrest = new PaycrestAdapter(env.server.PAYCREST_API_KEY);
      const order = await paycrest.createOrder({
        amount: normalizedAmount,
        rate: normalizedRate,
        token,
        network,
        reference,
        returnAddress,
        recipient,
      } as PayoutOrderRequest);

      const response = NextResponse.json({ data: order });
      response.headers.set('X-Request-Id', requestId);
      logger.logSuccess(200);
      return response;
    } catch (err: unknown) {
      logger.error('Error creating Paycrest order:', {}, err);

      if (err instanceof PaycrestHttpError) {
        logger.logError(err.status, err.message);
        return withRequestId(ErrorHandler.handle(err, err.status), requestId);
      }
    },
    { required: true },
  );
}
