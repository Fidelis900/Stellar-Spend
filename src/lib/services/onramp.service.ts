import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { onrampProviderRegistry } from '@/lib/onramp';
import { bridgeFromBaseToStellar, pollBridgeStatus } from '@/lib/onramp';
import type {
  OnrampQuoteRequest,
  OnrampQuoteResponse,
  OnrampOrderRequest,
  OnrampOrderResponse,
  OnrampOrderStatus,
  OnrampState,
} from '@/lib/onramp';

interface OnrampRecord {
  id: string;
  quoteId: string;
  state: OnrampState;
  fiatAmount: string;
  fiatCurrency: string;
  destinationAmount: string;
  destinationToken: string;
  destinationAddress: string;
  provider: string;
  providerOrderId?: string;
  rate: number;
  depositAddress?: string;
  depositNetwork?: string;
  bridgeTxHash?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const records = new Map<string, OnrampRecord>();

export class OnrampService {
  async getQuote(request: OnrampQuoteRequest): Promise<OnrampQuoteResponse> {
    const providers = onrampProviderRegistry.getProvidersForCorridor(
      request.fiatCurrency,
      request.destinationToken,
    );

    if (providers.length === 0) {
      throw new Error(
        `No provider available for ${request.fiatCurrency} → ${request.destinationToken}`,
      );
    }

    const providerName =
      request.provider && providers.includes(request.provider) ? request.provider : providers[0];

    const adapter = onrampProviderRegistry.getProvider(providerName);
    if (!adapter) throw new Error(`Provider ${providerName} not found`);

    const providerQuote = await adapter.getQuote({
      fiatAmount: request.fiatAmount,
      fiatCurrency: request.fiatCurrency,
      destinationToken: request.destinationToken,
      destinationNetwork: 'stellar',
    });

    const bridgeFee = (parseFloat(providerQuote.destinationAmount) * 0.005).toFixed(6);
    const totalFee = (parseFloat(providerQuote.fee) + parseFloat(bridgeFee)).toFixed(6);
    const destinationAmount = (
      parseFloat(providerQuote.destinationAmount) - parseFloat(bridgeFee)
    ).toFixed(6);

    return {
      quoteId: uuidv4(),
      fiatAmount: request.fiatAmount,
      fiatCurrency: request.fiatCurrency,
      destinationAmount,
      destinationToken: request.destinationToken,
      rate: providerQuote.rate,
      bridgeFee,
      providerFee: providerQuote.fee,
      totalFee,
      estimatedTime: providerQuote.estimatedTime + 120,
      validUntil: providerQuote.validUntil,
      provider: providerName,
    };
  }

  async createOrder(request: OnrampOrderRequest): Promise<OnrampOrderResponse> {
    const adapter = onrampProviderRegistry.getProvider(request.provider);
    if (!adapter) throw new Error(`Provider ${request.provider} not found`);

    const providerOrder = await adapter.createOrder({
      fiatAmount: request.fiatAmount,
      fiatCurrency: request.fiatCurrency,
      destinationAmount: request.destinationAmount,
      destinationToken: request.destinationToken,
      destinationNetwork: 'stellar',
      destinationAddress: request.destinationAddress,
      reference: `onramp_${uuidv4()}`,
    });

    const orderId = uuidv4();
    const now = Date.now();

    const record: OnrampRecord = {
      id: orderId,
      quoteId: request.quoteId,
      state: 'order_created',
      fiatAmount: request.fiatAmount,
      fiatCurrency: request.fiatCurrency,
      destinationAmount: request.destinationAmount,
      destinationToken: request.destinationToken,
      destinationAddress: request.destinationAddress,
      provider: request.provider,
      providerOrderId: providerOrder.orderId,
      rate: request.rate,
      depositAddress: providerOrder.depositAddress,
      depositNetwork: providerOrder.depositNetwork,
      createdAt: now,
      updatedAt: now,
    };

    records.set(orderId, record);

    return {
      orderId,
      status: 'order_created',
      depositAddress: providerOrder.depositAddress,
      depositNetwork: providerOrder.depositNetwork,
      depositAmount: providerOrder.depositAmount,
      depositToken: providerOrder.depositToken,
      destinationAmount: request.destinationAmount,
      destinationToken: request.destinationToken,
      destinationAddress: request.destinationAddress,
      fiatAmount: request.fiatAmount,
      fiatCurrency: request.fiatCurrency,
      provider: request.provider,
      createdAt: new Date(now).toISOString(),
      validUntil: providerOrder.validUntil,
    };
  }

  async getOrderStatus(orderId: string): Promise<OnrampOrderStatus> {
    const record = records.get(orderId);
    if (!record) throw new Error(`Order ${orderId} not found`);

    return {
      orderId: record.id,
      status: record.state,
      bridgeStatus: record.bridgeTxHash ? 'pending' : undefined,
      txHash: record.bridgeTxHash,
      error: record.error,
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
    };
  }

  async handleDepositConfirmed(orderId: string): Promise<void> {
    const record = records.get(orderId);
    if (!record) throw new Error(`Order ${orderId} not found`);

    record.state = 'deposit_confirmed';
    record.updatedAt = Date.now();

    const bridgeResult = await bridgeFromBaseToStellar({
      amount: record.destinationAmount,
      sourceToken: 'USDC',
      destinationToken: 'USDC',
      destinationAddress: record.destinationAddress,
      sourceChain: 'base',
      destinationChain: 'stellar',
    });

    record.bridgeTxHash = bridgeResult.txHash;
    record.state = 'bridge_pending';
    record.updatedAt = Date.now();
  }

  async handleBridgeCompleted(orderId: string): Promise<void> {
    const record = records.get(orderId);
    if (!record) throw new Error(`Order ${orderId} not found`);

    record.state = 'bridge_completed';
    record.updatedAt = Date.now();
  }

  async reconciliate(orderId: string): Promise<void> {
    const record = records.get(orderId);
    if (!record) throw new Error(`Order ${orderId} not found`);

    if (record.state === 'bridge_pending' && record.bridgeTxHash) {
      const status = await pollBridgeStatus(record.bridgeTxHash);
      if (status.status === 'completed') {
        record.state = 'completed';
        record.updatedAt = Date.now();
      } else if (status.status === 'failed') {
        record.state = 'failed';
        record.error = 'Bridge transfer failed';
        record.updatedAt = Date.now();
      }
    }
  }

  async handleWebhook(payload: { event: string; data: Record<string, unknown> }): Promise<void> {
    const orderId = payload.data.orderId as string;
    if (!orderId) throw new Error('No orderId in webhook payload');

    switch (payload.event) {
      case 'deposit.confirmed':
        await this.handleDepositConfirmed(orderId);
        break;
      case 'deposit.failed':
        this.failOrder(orderId, 'Deposit failed');
        break;
      case 'bridge.completed':
        await this.handleBridgeCompleted(orderId);
        break;
      default:
        logger.warn(`Unhandled onramp webhook event: ${payload.event}`);
    }
  }

  private failOrder(orderId: string, error: string): void {
    const record = records.get(orderId);
    if (record) {
      record.state = 'failed';
      record.error = error;
      record.updatedAt = Date.now();
    }
  }
}
