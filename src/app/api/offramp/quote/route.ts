<<<<<<< HEAD
import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { validateAmount } from '@/lib/offramp/utils/validation';
import { fetchPaycrestQuote, buildQuote, calculateBridgeAmount } from '@/lib/offramp/utils/quote-fetcher';
import { ErrorHandler } from '@/lib/error-handler';
import { withAllbridgeTimeout } from '@/lib/offramp/utils/timeout';
import { isSupportedCurrency } from '@/lib/currencies';
import { screenAddress } from '@/lib/compliance-screening';

export const maxDuration = 20;

const STABLECOIN_FEE = '0.5';

// Client sends "USDC" | "XLM"; build-tx route uses "stablecoin" | "native"
const FEE_METHOD_MAP: Record<string, 'stablecoin' | 'native'> = {
  USDC: 'stablecoin',
  stablecoin: 'stablecoin',
  XLM: 'native',
  native: 'native',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, feeMethod, sourceAddress } = body;

    if (sourceAddress) {
      const screeningResult = await screenAddress({
        address: sourceAddress,
        addressType: 'stellar',
        amount: parseFloat(amount),
        currency,
      });
      if (screeningResult.verdict === 'deny') {
        return NextResponse.json(
          { error: 'Source address blocked by compliance screening', screening: screeningResult },
          { status: 403 },
        );
      }
    }

    if (!validateAmount(String(amount ?? ''))) {
      return NextResponse.json(
        { error: 'Invalid amount: must be a positive number' },
=======
import { NextRequest, NextResponse } from 'next/server';
import { getQuote, type QuoteRequest } from '@/lib/quote-aggregator';

/**
 * POST /api/offramp/quote
 * 
 * Get exchange rate quote with caching
 * Implements stale-while-revalidate for responsive UX
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, currency, feeMethod = 'USDC' } = body;

    if (!amount || !currency) {
      return NextResponse.json(
        { error: 'Missing required fields: amount, currency' },
>>>>>>> de69014 (security+perf: pentest checklist, performance budgets, RSC streaming, cache tuning (#697 #698 #699 #700))
        { status: 400 }
      );
    }

<<<<<<< HEAD
    if (!currency || typeof currency !== 'string') {
      return NextResponse.json({ error: 'currency is required' }, { status: 400 });
    }

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: `Unsupported currency: ${currency}` }, { status: 400 });
    }

    const normalizedFee = FEE_METHOD_MAP[feeMethod];
    if (!normalizedFee) {
      return NextResponse.json(
        { error: 'feeMethod must be "USDC", "XLM", "stablecoin", or "native"' },
        { status: 400 }
      );
    }

    const bridgeAmount = normalizedFee === 'stablecoin'
      ? calculateBridgeAmount(String(amount), 'stablecoin', STABLECOIN_FEE)
      : String(amount);

    // Initialize Allbridge SDK
    let receiveAmount: string;
    try {
      const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await import('@allbridge/bridge-core-sdk');

      const sdk = new AllbridgeCoreSdk({
        ...nodeRpcUrlsDefault,
        sorobanNetworkPassphrase: 'Public Global Stellar Network ; September 2015',
        ...(env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL && {
          sorobanRpc: env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL,
        }),
        ...(env.server.BASE_RPC_URL && { ETH: env.server.BASE_RPC_URL }),
      });

      const chainDetails = await sdk.chainDetailsMap();
      let stellarChain: any = null;
      let baseChain: any = null;

      for (const [, chain] of Object.entries(chainDetails)) {
        const c = chain as any;
        if (c.name?.toLowerCase().includes('stellar') || c.name?.toLowerCase().includes('soroban')) stellarChain = c;
        if (c.name?.toLowerCase().includes('ethereum') || c.name?.toLowerCase().includes('base')) baseChain = c;
      }

      if (!stellarChain || !baseChain) throw new Error('Chain details unavailable');

      const stellarUsdc = stellarChain.tokens.find((t: any) => t.symbol === 'USDC');
      const baseUsdc = baseChain.tokens.find((t: any) => t.symbol === 'USDC');

      if (!stellarUsdc || !baseUsdc) throw new Error('USDC token not found');

      receiveAmount = await sdk.getAmountToBeReceived(bridgeAmount, stellarUsdc, baseUsdc);
    } catch {
      return NextResponse.json({ error: 'Bridge quote unavailable' }, { status: 502 });
    }

    // Fetch Paycrest FX rate
    let rate: number;
    let destinationAmount: string;
    try {
      ({ rate, destinationAmount } = await fetchPaycrestQuote(receiveAmount, currency));
    } catch {
      return NextResponse.json({ error: 'FX rate unavailable' }, { status: 502 });
    }

    const quote = buildQuote(destinationAmount, rate, currency, '0', '0', 300);
    return NextResponse.json(quote);
  } catch (error) {
    logger.error('Quote fetch error:', {}, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Invalid') || message.includes('less than')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to generate quote' }, { status: 500 });
=======
    const quoteRequest: QuoteRequest = {
      amount,
      sourceCurrency: 'USDC',
      destinationCurrency: currency,
      feeMethod,
    };

    const quote = await getQuote(quoteRequest);

    return NextResponse.json(quote);
  } catch (error) {
    console.error('[Quote API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
>>>>>>> de69014 (security+perf: pentest checklist, performance budgets, RSC streaming, cache tuning (#697 #698 #699 #700))
  }
}
