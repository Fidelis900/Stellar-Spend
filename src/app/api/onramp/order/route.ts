import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { globalContainer } from '@/lib/di';
import { SERVICE_KEYS } from '@/lib/di/registry';
import { withIdempotency } from '@/lib/idempotency';

export const maxDuration = 20;

export async function POST(request: NextRequest) {
  return withIdempotency(request, async () => {
    try {
      const body = await request.json();
      const { quoteId, fiatAmount, fiatCurrency, destinationAmount, destinationToken, destinationAddress, provider, rate } = body;

      if (!quoteId) {
        return NextResponse.json({ error: 'quoteId is required' }, { status: 400 });
      }

      if (!fiatAmount || parseFloat(fiatAmount) <= 0) {
        return NextResponse.json({ error: 'Invalid fiatAmount' }, { status: 400 });
      }

      if (!fiatCurrency) {
        return NextResponse.json({ error: 'fiatCurrency is required' }, { status: 400 });
      }

      if (!destinationAmount || parseFloat(destinationAmount) <= 0) {
        return NextResponse.json({ error: 'Invalid destinationAmount' }, { status: 400 });
      }

      if (!destinationToken) {
        return NextResponse.json({ error: 'destinationToken is required' }, { status: 400 });
      }

      if (!destinationAddress) {
        return NextResponse.json({ error: 'destinationAddress is required' }, { status: 400 });
      }

      if (!provider) {
        return NextResponse.json({ error: 'provider is required' }, { status: 400 });
      }

      if (!rate || rate <= 0) {
        return NextResponse.json({ error: 'Invalid rate' }, { status: 400 });
      }

      const svc = await globalContainer.resolve(SERVICE_KEYS.ONRAMP_SERVICE);
      const order = await svc.createOrder({
        quoteId,
        fiatAmount,
        fiatCurrency,
        destinationAmount,
        destinationToken,
        destinationAddress,
        provider,
        rate,
      });

      return NextResponse.json(order, { status: 201 });
    } catch (error) {
      logger.error('Onramp order error:', {}, error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }, { required: true });
}
