import { HttpClient } from './http-client';
import { type ClientConfig } from './base';

export interface PaycrestClientConfig extends ClientConfig {
  apiKey: string;
  apiUrl?: string;
}

export interface PayoutOrderRequest {
  amount: string;
  currency: string;
  institution: string;
  accountIdentifier: string;
  accountName?: string;
}

export interface PayoutOrderResponse {
  id: string;
  status: string;
  amount: string;
  currency: string;
}

export class PaycrestClient {
  private http: HttpClient;

  constructor(config: PaycrestClientConfig) {
    this.http = new HttpClient({
      baseUrl: config.apiUrl || 'https://api.paycrest.io/v1',
      timeout: config.timeout,
      retries: config.retries,
      retryDelay: config.retryDelay,
      headers: { 'API-Key': config.apiKey, 'Content-Type': 'application/json' },
    });
  }

  async createOrder(request: PayoutOrderRequest): Promise<PayoutOrderResponse> {
    return this.http.post('/sender/orders', request);
  }

  async getOrderStatus(orderId: string): Promise<{ status: string; id: string }> {
    return this.http.get(`/sender/orders/${orderId}`);
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
