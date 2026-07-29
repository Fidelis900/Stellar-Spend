import type { PayoutOrderRequest, PayoutOrderResponse, PayoutStatus } from '../types';
import type { PayoutProviderAdapter, PayoutHealth } from './payout-provider';
import { HttpClient } from '../../clients/http-client';

const PAYCREST_STATUS_MAP: Record<string, PayoutStatus> = {
  'payment_order.pending': 'pending',
  'payment_order.validated': 'validated',
  'payment_order.settled': 'settled',
  'payment_order.refunded': 'refunded',
  'payment_order.expired': 'expired',
};

export function mapPaycrestStatus(webhookStatus: string): PayoutStatus {
  return PAYCREST_STATUS_MAP[webhookStatus] ?? 'pending';
}

export class PaycrestHttpError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'PaycrestHttpError';
    this.status = status;
    this.details = details;
    // Restore correct prototype chain for instanceof checks across transpilation boundaries
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PaycrestAdapter implements PayoutProviderAdapter {
  private http: HttpClient;

  constructor(apiKey: string) {
    this.http = new HttpClient({
      baseUrl: 'https://api.paycrest.io/v1',
      headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' },
    });
  }

  async createOrder(request: PayoutOrderRequest): Promise<PayoutOrderResponse> {
    return this.http.post('/sender/orders', request);
  }

  async getOrderStatus(orderId: string): Promise<{ status: PayoutStatus; id: string }> {
    const response: any = await this.http.get(`/sender/orders/${orderId}`);
    return { status: response.status as PayoutStatus, id: response.id };
  }

  async getCurrencies(): Promise<Array<{ code: string; name: string; symbol: string }>> {
    return this.http.get('/sender/currencies');
  }

  async getInstitutions(currency: string): Promise<Array<{ code: string; name: string }>> {
    return this.http.get(`/sender/institutions/${currency}`);
  }

  async verifyAccount(institution: string, accountIdentifier: string): Promise<string> {
    try {
      const response: any = await this.http.post('/sender/verify-account', {
        institution,
        accountIdentifier,
      });
      return response?.accountName || response?.data || '';
    } catch {
      return '';
    }
  }

  async getHealth(): Promise<PayoutHealth> {
    const start = Date.now();
    try {
      await this.http.get('/sender/currencies');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async getRate(
    token: string,
    amount: string,
    currency: string,
    options?: { network?: string; providerId?: string },
  ): Promise<number> {
    const queryParams = new URLSearchParams();
    if (options?.network) queryParams.set('network', options.network);
    if (options?.providerId) queryParams.set('provider_id', options.providerId);

    const qs = queryParams.toString();
    const response: any = await this.http.get(
      `/rates/${encodeURIComponent(token)}/${encodeURIComponent(amount)}/${encodeURIComponent(currency)}${qs ? `?${qs}` : ''}`,
    );

    const rate = parseFloat(String(response?.data ?? response));
    if (!isFinite(rate)) throw new Error(`Invalid rate received: ${JSON.stringify(response)}`);
    return rate;
  }
}
