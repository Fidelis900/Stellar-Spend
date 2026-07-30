import { validateAmount } from '@/lib/offramp';
import {
  fetchPaycrestQuote,
  buildQuote,
  calculateBridgeAmount,
} from '@/lib/offramp';
import { isSupportedCurrency } from '@/lib/currencies';

export interface QuoteRequest {
  amount: string;
  currency: string;
  feeMethod: 'USDC' | 'XLM' | 'stablecoin' | 'native';
}

export interface QuoteResponse {
  destinationAmount: string;
  rate: number;
  currency: string;
  bridgeFee: string;
  payoutFee: string;
  estimatedTime: number;
}

const STABLECOIN_FEE = '0.5';

const FEE_METHOD_MAP: Record<string, 'stablecoin' | 'native'> = {
  USDC: 'stablecoin',
  stablecoin: 'stablecoin',
  XLM: 'native',
  native: 'native',
};

export class QuoteService {
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    this.validateRequest(request);

    const normalizedFee = FEE_METHOD_MAP[request.feeMethod];
    if (!normalizedFee) {
      throw new Error('feeMethod must be "USDC", "XLM", "stablecoin", or "native"');
    }

    const bridgeAmount =
      normalizedFee === 'stablecoin'
        ? calculateBridgeAmount(String(request.amount), 'stablecoin', STABLECOIN_FEE)
        : String(request.amount);

    const paycrestQuote = await fetchPaycrestQuote(bridgeAmount, request.currency);
    return buildQuote(paycrestQuote, request.currency, normalizedFee);
  }

  private validateRequest(request: QuoteRequest): void {
    if (!validateAmount(String(request.amount ?? ''))) {
      throw new Error('Invalid amount: must be a positive number');
    }

    if (!request.currency || typeof request.currency !== 'string') {
      throw new Error('currency is required');
    }

    if (!isSupportedCurrency(request.currency)) {
      throw new Error(`Unsupported currency: ${request.currency}`);
    }
  }
}
