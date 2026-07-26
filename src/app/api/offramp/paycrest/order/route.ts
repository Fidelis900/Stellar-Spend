import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { paycrestOrderLimiter, getClientIp } from '@/lib/offramp/utils/rate-limiter';
import { generateRequestId, createRequestLogger } from '@/lib/offramp/utils/logger';
import { withIdempotency } from '@/lib/idempotency';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 20;

import { PayoutOrderRequest } from '@/lib/offramp/types';

import { PaycrestAdapter, PaycrestHttpError } from '@/lib/offramp/adapters/paycrest-adapter';

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

      const body = await req.json();
      const { amount, rate, token, network, reference, returnAddress, recipient } = body;

      const errors: Record<string, string> = {};

      if (amount === undefined || amount === null) {
        errors.amount = 'amount is required';
      } else if (typeof amount !== 'number' || amount <= 0) {
        errors.amount = 'amount must be a positive number';
      }

      if (rate === undefined || rate === null) {
        errors.rate = 'rate is required';
      } else if (typeof rate !== 'number' || rate <= 0) {
        errors.rate = 'rate must be a positive number';
      }

      if (!token || typeof token !== 'string') {
        errors.token = 'token is required and must be a string';
      }

      if (!network || typeof network !== 'string') {
        errors.network = 'network is required and must be a string';
      }

      if (!reference || typeof reference !== 'string') {
        errors.reference = 'reference is required and must be a string';
      }

      if (!returnAddress || typeof returnAddress !== 'string') {
        errors.returnAddress = 'returnAddress is required and must be a string';
      }

      if (!recipient || typeof recipient !== 'object') {
        errors.recipient = 'recipient is required and must be an object';
      } else {
        const { institution, accountIdentifier, accountName, currency } = recipient;

        if (!institution || typeof institution !== 'string') {
          errors['recipient.institution'] = 'recipient.institution is required and must be a string';
        }

        if (!accountIdentifier || typeof accountIdentifier !== 'string') {
          errors['recipient.accountIdentifier'] = 'recipient.accountIdentifier is required and must be a string';
        }

        if (!accountName || typeof accountName !== 'string') {
          errors['recipient.accountName'] = 'recipient.accountName is required and must be a string';
        }

        if (!currency || typeof currency !== 'string') {
          errors['recipient.currency'] = 'recipient.currency is required and must be a string';
        }
      }

      if (Object.keys(errors).length > 0) {
        logger.logError(400, 'Validation failed');
        return withRequestId(
          ErrorHandler.handle(new ApiError(ErrorType.VALIDATION, 'Validation failed', 400, errors)),
          requestId
        );
      }

      const normalizedAmount = Math.floor(amount * 1e6) / 1e6;
      const normalizedRate = Number(rate.toFixed(6));

      logger.info('[paycrest/order] amount normalization', {
        raw: { amount, rate },
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

      logger.logError(500, err instanceof Error ? err.message : 'Internal server error');
      return withRequestId(ErrorHandler.serverError(err), requestId);
    }
  }, { required: true });
}
