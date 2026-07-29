import type { PayoutStatus } from '@/lib/transaction-status';

export interface PayoutRequest {
  orderId: string;
  amount: string;
  currency: string;
  beneficiary: {
    institution: string;
    accountIdentifier: string;
    accountName: string;
  };
  baseAddress: string;
}

export interface PayoutResponse {
  orderId: string;
  status: string;
  createdAt: string;
}

export interface PayoutStatusResponse {
  orderId: string;
  status: PayoutStatus;
  amount: string;
  currency: string;
  settledAt?: string;
  error?: string;
}

export class PayoutService {
  async createOrder(request: PayoutRequest): Promise<PayoutResponse> {
    this.validatePayoutRequest(request);

    // Create payout order logic would go here
    // This would integrate with Paycrest API
    return {
      orderId: request.orderId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  async getOrderStatus(orderId: string): Promise<PayoutStatusResponse> {
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    // Poll payout status logic would go here
    return {
      orderId,
      status: 'pending',
      amount: '100.00',
      currency: 'NGN',
    };
  }

  async executePayout(orderId: string, baseUsdcAmount: string): Promise<{ success: boolean }> {
    if (!orderId || !baseUsdcAmount) {
      throw new Error('Order ID and USDC amount are required');
    }

    // Execute payout logic would go here
    // This would send USDC from Base to settlement address
    return { success: true };
  }

  private validatePayoutRequest(request: PayoutRequest): void {
    if (!request.orderId) {
      throw new Error('Order ID is required');
    }

    if (!request.amount || parseFloat(request.amount) <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (!request.currency) {
      throw new Error('Currency is required');
    }

    if (!request.beneficiary?.institution || !request.beneficiary?.accountIdentifier) {
      throw new Error('Beneficiary information is incomplete');
    }

    if (!request.baseAddress) {
      throw new Error('Base address is required');
    }
  }
}
