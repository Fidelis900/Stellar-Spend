import type { PayoutOrderRequest, PayoutOrderResponse, PayoutStatus } from '../types';

export interface PayoutHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface PayoutProviderAdapter {
  getCurrencies(): Promise<Array<{ code: string; name: string; symbol: string }>>;
  getInstitutions(currency: string): Promise<Array<{ code: string; name: string }>>;
  verifyAccount(institution: string, accountIdentifier: string): Promise<string>;
  getRate(
    token: string,
    amount: string,
    currency: string,
    options?: { network?: string; providerId?: string },
  ): Promise<number>;
  createOrder(request: PayoutOrderRequest): Promise<PayoutOrderResponse>;
  getOrderStatus(orderId: string): Promise<{ status: PayoutStatus; id: string }>;
  getHealth(): Promise<PayoutHealth>;
}
