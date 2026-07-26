import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { onrampProviderRegistry } from '@/lib/onramp/adapters/provider-registry';
import { verifyHmacSignature } from '@/lib/webhookVerify';

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
      return NextResponse.json({ error: 'X-Provider header is required' }, { status: 400 });
    }

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const adapter = onrampProviderRegistry.getProvider(provider);
    if (!adapter) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    const secret = resolveProviderWebhookSecret(provider);
    if (!secret) {
      logger.error('Onramp webhook secret not configured for provider', { provider });
      return NextResponse.json({ error: 'Webhook not configured for this provider' }, { status: 500 });
    }

    const verification = await verifyHmacSignature(rawBody, signature, secret);
    if (!verification.valid) {
      logger.warn('Onramp webhook signature verification failed', { provider, reason: verification.reason });
      return NextResponse.json({ error: verification.reason ?? 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
    await svc.handleWebhook(payload);

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Onramp webhook error:', {}, error);
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
