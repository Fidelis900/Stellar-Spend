import type {
  DepositProviderAdapter,
  OnrampProviderQuoteRequest,
  OnrampProviderQuoteResponse,
  OnrampProviderOrderRequest,
  OnrampProviderOrderResponse,
  OnrampProviderCapabilities,
} from './deposit-provider';

const MOONPAY_API_BASE = 'https://api.moonpay.com/v1';

export class MoonpayAdapter implements DepositProviderAdapter {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(apiKey: string, secretKey: string) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.baseUrl = MOONPAY_API_BASE;
  }

  async getQuote(request: OnrampProviderQuoteRequest): Promise<OnrampProviderQuoteResponse> {
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      baseCurrencyAmount: request.fiatAmount,
      baseCurrencyCode: request.fiatCurrency,
      quoteCurrencyCode: request.destinationToken,
    });

    const response = await fetch(
      `${this.baseUrl}/v3/currencies/${request.destinationToken.toLowerCase()}/buy_quote?${params}`,
    );
    if (!response.ok) throw new Error(`MoonPay quote error: ${response.statusText}`);
    const data = await response.json();

    const destinationAmount = String(parseFloat(data.quoteCurrencyAmount || '0'));
    const fee = String(
      parseFloat(request.fiatAmount) - parseFloat(data.baseCurrencyAmount || request.fiatAmount) ||
        '0',
    );

    return {
      destinationAmount,
      rate: parseFloat(data.quoteCurrencyAmount || '0') / parseFloat(request.fiatAmount) || 0,
      fee,
      estimatedTime: 60,
      validUntil: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async createOrder(request: OnrampProviderOrderRequest): Promise<OnrampProviderOrderResponse> {
    const response = await fetch(`${this.baseUrl}/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secretKey}`,
      },
      body: JSON.stringify({
        baseCurrencyAmount: parseFloat(request.fiatAmount),
        baseCurrencyCode: request.fiatCurrency,
        quoteCurrencyCode: request.destinationToken,
        walletAddress: request.destinationAddress,
        walletAddressTag: '',
      }),
    });

    if (!response.ok) throw new Error(`MoonPay order error: ${response.statusText}`);
    const data = await response.json();

    return {
      orderId: data.id,
      depositAddress: data.depositAddress || data.walletAddress,
      depositNetwork: 'bank_transfer',
      depositAmount: request.fiatAmount,
      depositToken: request.fiatCurrency,
      status: 'pending',
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }

  async getOrderStatus(orderId: string): Promise<{ status: string; txHash?: string }> {
    const response = await fetch(`${this.baseUrl}/v1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    if (!response.ok) throw new Error(`MoonPay status error: ${response.statusText}`);
    const data = await response.json();

    const statusMap: Record<string, string> = {
      waitingPayment: 'pending',
      pending: 'pending',
      preparing: 'processing',
      sent: 'completed',
      complete: 'completed',
      failed: 'failed',
      cancelled: 'failed',
    };

    return {
      status: statusMap[data.status] || 'pending',
      txHash: data.transactionHash || data.cryptoTransactionId,
    };
  }

  async getHealth(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/ping`);
      return { ok: response.ok, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  getCapabilities(): OnrampProviderCapabilities {
    return {
      supportedFiatCurrencies: [
        'USD',
        'EUR',
        'GBP',
        'NGN',
        'KES',
        'BRL',
        'MXN',
        'INR',
        'PHP',
        'AED',
      ],
      supportedDestinationTokens: ['USDC', 'USDT'],
      supportedNetworks: ['stellar', 'base', 'ethereum'],
      maxAmount: 50_000,
      minAmount: 10,
      instantSettlement: false,
    };
  }
}
