import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { onrampProviderRegistry } from '@/lib/onramp/adapters/provider-registry';
import { verifyHmacSignature } from '@/lib/webhookVerify';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export const maxDuration = 15;

function resolveProviderWebhookSecret(provider: string): string | undefined {
  return process.env[`ONRAMP_${provider.toUpperCase()}_WEBHOOK_SECRET`];
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('X-Provider-Signature') ?? '';
    const provider = request.headers.get('X-Provider') ?? '';

    if (!provider) {
      return ErrorHandler.validation('X-Provider header is required');
    }

    if (!signature) {
      return ErrorHandler.unauthorized('Missing signature');
    }

    const adapter = onrampProviderRegistry.getProvider(provider);
    if (!adapter) {
      return ErrorHandler.validation(`Unknown provider: ${provider}`);
    }

    const secret = resolveProviderWebhookSecret(provider);
    if (!secret) {
      logger.error('Onramp webhook secret not configured for provider', { provider });
      return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Webhook not configured for this provider'));
    }

    const verification = await verifyHmacSignature(rawBody, signature, secret);
    if (!verification.valid) {
      logger.warn('Onramp webhook signature verification failed', { provider, reason: verification.reason });
      return ErrorHandler.unauthorized(verification.reason ?? 'Invalid signature');
    }

    const payload = JSON.parse(rawBody);
    const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
    await svc.handleWebhook(payload);

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Onramp webhook error:', {}, error);
    return ErrorHandler.serverError(error);
  }
}
