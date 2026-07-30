import { mapPaycrestStatus } from '@/lib/offramp';
import { dal, DatabaseError } from '@/lib/db';
import { notifyTransactionStatusUpdate } from '@/lib/notifications';

export interface WebhookPayload {
  event: string;
  data: {
    id?: string;
    orderId?: string;
    [key: string]: unknown;
  };
}

export interface WebhookProcessResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export class WebhookService {
  async processPaycrestWebhook(payload: WebhookPayload): Promise<WebhookProcessResult> {
    try {
      this.validatePayload(payload);

      const eventType = payload.event;
      const orderId = payload.data?.id ?? payload.data?.orderId ?? '';

      if (!orderId) {
        return { success: false, error: 'No order ID found in webhook' };
      }

      const transaction = await dal.getByPayoutOrderId(orderId);
      if (!transaction) {
        return { success: false, error: 'No transaction found for order' };
      }

      const updates = this.mapEventToUpdates(eventType);
      if (!updates) {
        return { success: true, transactionId: transaction.id };
      }

      await dal.update(transaction.id, updates);
      const updated = await dal.getById(transaction.id);

      if (updated) {
        await notifyTransactionStatusUpdate({
          transaction: updated,
          previousStatus: transaction.status,
          previousPayoutStatus: transaction.payoutStatus,
          source: 'webhook',
        });
      }

      return { success: true, transactionId: transaction.id };
    } catch (err) {
      if (err instanceof DatabaseError) {
        return { success: false, error: err.message };
      }
      return { success: false, error: 'Failed to process webhook' };
    }
  }

  private validatePayload(payload: WebhookPayload): void {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid webhook payload');
    }

    if (!payload.event || typeof payload.event !== 'string') {
      throw new Error('Event type is required');
    }

    if (!payload.data || typeof payload.data !== 'object') {
      throw new Error('Webhook data is required');
    }
  }

  private mapEventToUpdates(eventType: string): Record<string, unknown> | null {
    switch (eventType) {
      case 'payment_order.settled':
        return { status: 'completed', payoutStatus: 'settled' };
      case 'payment_order.pending':
        return { payoutStatus: 'pending' };
      case 'payment_order.refunded':
        return { status: 'failed', payoutStatus: 'refunded', error: 'Refunded by Paycrest' };
      case 'payment_order.expired':
        return { status: 'failed', payoutStatus: 'expired', error: 'Order expired' };
      default:
        return null;
    }
  }
}
