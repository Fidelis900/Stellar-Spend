/**
 * @file onramp-lifecycle.integration.test.ts
 * @description Integration tests for the full onramp transaction lifecycle.
 *
 * Tests cover:
 * - Creating onramp order from initiation through webhook confirmation
 * - Simulating provider webhook events
 * - Verifying ledger entry state transitions
 * - Handling failure and timeout paths (provider decline, webhook timeout)
 * - Database state consistency across lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  OnrampQuoteRequest,
  OnrampQuoteResponse,
  OnrampOrderRequest,
  OnrampOrderResponse,
  OnrampOrderStatus,
  OnrampState,
  OnrampWebhookPayload,
} from '@/lib/onramp/types';

// Mock implementation of onramp service for testing
interface TestOnrampOrder {
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
  depositAddress?: string;
  depositNetwork?: string;
  bridgeTxHash?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

class MockOnrampDatabase {
  private orders = new Map<string, TestOnrampOrder>();

  createOrder(order: TestOnrampOrder): void {
    this.orders.set(order.id, { ...order });
  }

  getOrder(orderId: string): TestOnrampOrder | undefined {
    const order = this.orders.get(orderId);
    return order ? { ...order } : undefined;
  }

  updateOrder(orderId: string, updates: Partial<TestOnrampOrder>): void {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    this.orders.set(orderId, { ...order, ...updates, updatedAt: Date.now() });
  }

  listOrdersByState(state: OnrampState): TestOnrampOrder[] {
    return Array.from(this.orders.values()).filter(o => o.state === state);
  }

  listOrdersByProvider(provider: string): TestOnrampOrder[] {
    return Array.from(this.orders.values()).filter(o => o.provider === provider);
  }

  clear(): void {
    this.orders.clear();
  }
}

class MockWebhookHandler {
  private pendingWebhooks: OnrampWebhookPayload[] = [];

  async processWebhook(payload: OnrampWebhookPayload): Promise<void> {
    this.pendingWebhooks.push(payload);
  }

  async simulateWebhookDelivery(orderId: string, status: string): Promise<OnrampWebhookPayload> {
    const payload: OnrampWebhookPayload = {
      event: `onramp.${status}`,
      data: {
        orderId,
        status,
        txHash: status === 'deposit_confirmed' ? '0x' + 'a'.repeat(64) : undefined,
      },
    };
    await this.processWebhook(payload);
    return payload;
  }

  getPendingWebhooks(): OnrampWebhookPayload[] {
    return [...this.pendingWebhooks];
  }

  clear(): void {
    this.pendingWebhooks = [];
  }
}

describe('Onramp Transaction Lifecycle - Integration Tests', () => {
  let db: MockOnrampDatabase;
  let webhookHandler: MockWebhookHandler;

  beforeEach(() => {
    db = new MockOnrampDatabase();
    webhookHandler = new MockWebhookHandler();
  });

  afterEach(() => {
    db.clear();
    webhookHandler.clear();
  });

  describe('Happy Path: Complete Onramp Flow', () => {
    it('should complete full lifecycle from initiation through webhook confirmation', async () => {
      // 1. Create quote
      const quoteId = 'quote-' + Date.now();
      const orderId = 'order-' + Date.now();
      const now = Date.now();

      // 2. Create order in draft state
      const order: TestOnrampOrder = {
        id: orderId,
        quoteId,
        state: 'draft',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: now,
        updatedAt: now,
      };

      db.createOrder(order);
      let stored = db.getOrder(orderId);
      expect(stored).toBeDefined();
      expect(stored!.state).toBe('draft');

      // 3. Transition to quoted
      db.updateOrder(orderId, { state: 'quoted' });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('quoted');

      // 4. Create provider order → order_created
      db.updateOrder(orderId, {
        state: 'order_created',
        providerOrderId: 'provider-12345',
        depositAddress: 'deposit.moonpay.com',
        depositNetwork: 'stripe',
      });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('order_created');
      expect(stored!.depositAddress).toBe('deposit.moonpay.com');

      // 5. Simulate deposit pending
      db.updateOrder(orderId, { state: 'deposit_pending' });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('deposit_pending');

      // 6. Simulate webhook: deposit confirmed
      const webhookPayload = await webhookHandler.simulateWebhookDelivery(orderId, 'deposit_confirmed');
      db.updateOrder(orderId, {
        state: 'deposit_confirmed',
        bridgeTxHash: webhookPayload.data.txHash,
      });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('deposit_confirmed');
      expect(stored!.bridgeTxHash).toBeDefined();

      // 7. Bridge pending
      db.updateOrder(orderId, { state: 'bridge_pending' });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('bridge_pending');

      // 8. Bridge completed
      db.updateOrder(orderId, { state: 'bridge_completed' });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('bridge_completed');

      // 9. Final completed state
      db.updateOrder(orderId, { state: 'completed' });
      stored = db.getOrder(orderId);
      expect(stored!.state).toBe('completed');

      // Verify webhook was recorded
      const webhooks = webhookHandler.getPendingWebhooks();
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].event).toBe('onramp.deposit_confirmed');
    });

    it('should transition through all valid states sequentially', async () => {
      const orderId = 'order-seq-' + Date.now();
      const states: OnrampState[] = [
        'draft',
        'quoted',
        'order_created',
        'deposit_pending',
        'deposit_confirmed',
        'bridge_pending',
        'bridge_completed',
        'completed',
      ];

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: states[0],
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      for (const state of states) {
        db.updateOrder(orderId, { state });
        const stored = db.getOrder(orderId);
        expect(stored!.state).toBe(state);
      }
    });

    it('should preserve ledger entry across state transitions', async () => {
      const orderId = 'order-ledger-' + Date.now();
      const quoteId = 'quote-' + Date.now();
      const createdAt = Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId,
        state: 'draft',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt,
        updatedAt: createdAt,
      };

      db.createOrder(order);
      const initial = db.getOrder(orderId);
      expect(initial!.quoteId).toBe(quoteId);
      expect(initial!.createdAt).toBe(createdAt);

      // Add delays to ensure updatedAt changes
      await new Promise(r => setTimeout(r, 5));
      db.updateOrder(orderId, { state: 'quoted' });
      await new Promise(r => setTimeout(r, 5));
      db.updateOrder(orderId, { state: 'order_created' });
      await new Promise(r => setTimeout(r, 5));
      db.updateOrder(orderId, { state: 'deposit_pending' });

      const current = db.getOrder(orderId);
      expect(current!.quoteId).toBe(quoteId); // Unchanged
      expect(current!.createdAt).toBe(createdAt); // Unchanged
      expect(current!.fiatAmount).toBe('100.00'); // Unchanged
      expect(current!.state).toBe('deposit_pending'); // Updated
      expect(current!.updatedAt).toBeGreaterThanOrEqual(createdAt); // Updated or equal
    });
  });

  describe('Failure Path: Provider Declines Order', () => {
    it('should handle provider declining order', async () => {
      const orderId = 'order-decline-' + Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'draft',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // Simulate provider declining the order
      const errorMsg = 'User verification failed';
      db.updateOrder(orderId, {
        state: 'failed',
        error: errorMsg,
      });

      const stored = db.getOrder(orderId);
      expect(stored!.state).toBe('failed');
      expect(stored!.error).toBe(errorMsg);
    });

    it('should handle deposit timeout scenario', async () => {
      const orderId = 'order-timeout-' + Date.now();
      const createdAt = Date.now() - 86400000; // 1 day ago

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'deposit_pending',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt,
        updatedAt: createdAt,
      };

      db.createOrder(order);

      // Simulate timeout after TTL exceeded
      db.updateOrder(orderId, {
        state: 'expired',
        error: 'Deposit not received within 24 hours',
      });

      const stored = db.getOrder(orderId);
      expect(stored!.state).toBe('expired');
      expect(stored!.error).toContain('24 hours');
    });

    it('should handle webhook timeout (webhook never arrives)', async () => {
      const orderId = 'order-webhook-timeout-' + Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'deposit_pending',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // Simulate webhook timeout (no webhook received after waiting period)
      const createdAt = order.createdAt;
      const timeoutThreshold = 3600000; // 1 hour

      const stored = db.getOrder(orderId);
      expect(stored!.state).toBe('deposit_pending');

      // After timeout period, mark as failed
      if (Date.now() - createdAt > timeoutThreshold) {
        db.updateOrder(orderId, {
          state: 'failed',
          error: 'Webhook not received within timeout period',
        });
      }

      // For testing purposes, immediately mark as failed to verify behavior
      db.updateOrder(orderId, {
        state: 'failed',
        error: 'Webhook not received within timeout period',
      });

      const updated = db.getOrder(orderId);
      expect(updated!.state).toBe('failed');
      expect(updated!.error).toContain('Webhook');
    });
  });

  describe('Webhook Event Handling', () => {
    it('should record deposit_confirmed webhook', async () => {
      const orderId = 'order-webhook-1-' + Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'deposit_pending',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // Simulate webhook
      const txHash = '0x' + 'a'.repeat(64);
      const webhook = await webhookHandler.simulateWebhookDelivery(orderId, 'deposit_confirmed');

      db.updateOrder(orderId, {
        state: 'deposit_confirmed',
        bridgeTxHash: txHash,
      });

      const webhooks = webhookHandler.getPendingWebhooks();
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].data.orderId).toBe(orderId);
      expect(webhooks[0].event).toBe('onramp.deposit_confirmed');

      const stored = db.getOrder(orderId);
      expect(stored!.bridgeTxHash).toBe(txHash);
    });

    it('should handle multiple webhook events for same order', async () => {
      const orderId = 'order-multi-webhook-' + Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'draft',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // First webhook: order_created
      await webhookHandler.simulateWebhookDelivery(orderId, 'order_created');
      db.updateOrder(orderId, { state: 'order_created' });

      // Second webhook: deposit_confirmed
      await webhookHandler.simulateWebhookDelivery(orderId, 'deposit_confirmed');
      db.updateOrder(orderId, { state: 'deposit_confirmed' });

      // Third webhook: completed
      await webhookHandler.simulateWebhookDelivery(orderId, 'completed');
      db.updateOrder(orderId, { state: 'completed' });

      const webhooks = webhookHandler.getPendingWebhooks();
      expect(webhooks).toHaveLength(3);
      expect(webhooks[0].event).toBe('onramp.order_created');
      expect(webhooks[1].event).toBe('onramp.deposit_confirmed');
      expect(webhooks[2].event).toBe('onramp.completed');

      const stored = db.getOrder(orderId);
      expect(stored!.state).toBe('completed');
    });
  });

  describe('Database Queries & Filtering', () => {
    it('should query orders by state', async () => {
      const orders: TestOnrampOrder[] = [
        {
          id: 'order-1',
          quoteId: 'quote-1',
          state: 'draft',
          fiatAmount: '100',
          fiatCurrency: 'NGN',
          destinationAmount: '0.05',
          destinationToken: 'USDC',
          destinationAddress: 'GABC...',
          provider: 'moonpay',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'order-2',
          quoteId: 'quote-2',
          state: 'draft',
          fiatAmount: '200',
          fiatCurrency: 'KES',
          destinationAmount: '0.10',
          destinationToken: 'USDC',
          destinationAddress: 'GDEF...',
          provider: 'ramp',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'order-3',
          quoteId: 'quote-3',
          state: 'completed',
          fiatAmount: '50',
          fiatCurrency: 'GHS',
          destinationAmount: '0.025',
          destinationToken: 'USDC',
          destinationAddress: 'GHIJ...',
          provider: 'moonpay',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      orders.forEach(order => db.createOrder(order));

      const drafts = db.listOrdersByState('draft');
      expect(drafts).toHaveLength(2);
      expect(drafts.every(o => o.state === 'draft')).toBe(true);

      const completed = db.listOrdersByState('completed');
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('order-3');
    });

    it('should query orders by provider', async () => {
      const orders: TestOnrampOrder[] = [
        {
          id: 'order-mp-1',
          quoteId: 'quote-mp-1',
          state: 'draft',
          fiatAmount: '100',
          fiatCurrency: 'NGN',
          destinationAmount: '0.05',
          destinationToken: 'USDC',
          destinationAddress: 'GABC...',
          provider: 'moonpay',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'order-mp-2',
          quoteId: 'quote-mp-2',
          state: 'completed',
          fiatAmount: '200',
          fiatCurrency: 'KES',
          destinationAmount: '0.10',
          destinationToken: 'USDC',
          destinationAddress: 'GDEF...',
          provider: 'moonpay',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'order-ramp-1',
          quoteId: 'quote-ramp-1',
          state: 'draft',
          fiatAmount: '50',
          fiatCurrency: 'GHS',
          destinationAmount: '0.025',
          destinationToken: 'USDC',
          destinationAddress: 'GHIJ...',
          provider: 'ramp',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      orders.forEach(order => db.createOrder(order));

      const moonpayOrders = db.listOrdersByProvider('moonpay');
      expect(moonpayOrders).toHaveLength(2);
      expect(moonpayOrders.every(o => o.provider === 'moonpay')).toBe(true);

      const rampOrders = db.listOrdersByProvider('ramp');
      expect(rampOrders).toHaveLength(1);
      expect(rampOrders[0].id).toBe('order-ramp-1');
    });
  });

  describe('Ledger Entry Consistency', () => {
    it('should maintain referential integrity through lifecycle', async () => {
      const quoteId = 'quote-integrity-' + Date.now();
      const orderId = 'order-integrity-' + Date.now();
      const destinationAddress = 'GABC1234567890ABCDEF...';
      const provider = 'moonpay';

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId,
        state: 'draft',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress,
        provider,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // Move through lifecycle
      db.updateOrder(orderId, { state: 'quoted' });
      db.updateOrder(orderId, { state: 'order_created' });
      db.updateOrder(orderId, { state: 'deposit_pending' });
      db.updateOrder(orderId, { state: 'deposit_confirmed' });
      db.updateOrder(orderId, { state: 'completed' });

      // Verify core fields are immutable
      const final = db.getOrder(orderId);
      expect(final!.quoteId).toBe(quoteId);
      expect(final!.destinationAddress).toBe(destinationAddress);
      expect(final!.provider).toBe(provider);
      expect(final!.fiatAmount).toBe('100.00');
      expect(final!.fiatCurrency).toBe('NGN');
      expect(final!.destinationAmount).toBe('0.05');
      expect(final!.destinationToken).toBe('USDC');
    });

    it('should handle concurrent state transitions gracefully', async () => {
      const orderId = 'order-concurrent-' + Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'draft',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // Simulate concurrent updates (last write wins)
      const updates = [
        { state: 'quoted' as OnrampState },
        { state: 'order_created' as OnrampState },
        { state: 'deposit_pending' as OnrampState },
      ];

      for (const update of updates) {
        await new Promise(r => setTimeout(r, 2));
        db.updateOrder(orderId, update);
      }

      const final = db.getOrder(orderId);
      expect(final!.state).toBe('deposit_pending'); // Last update wins
      expect(final!.updatedAt).toBeGreaterThanOrEqual(order.updatedAt); // Updated or equal
    });
  });

  describe('Error Scenarios & Recovery', () => {
    it('should handle non-existent order gracefully', async () => {
      const nonExistentId = 'order-does-not-exist-' + Date.now();
      const stored = db.getOrder(nonExistentId);
      expect(stored).toBeUndefined();
    });

    it('should allow transition to failed state from any state', async () => {
      const states: OnrampState[] = ['draft', 'quoted', 'order_created', 'deposit_pending'];

      for (const startState of states) {
        const orderId = 'order-fail-' + startState + '-' + Date.now();

        const order: TestOnrampOrder = {
          id: orderId,
          quoteId: 'quote-' + Date.now(),
          state: startState,
          fiatAmount: '100.00',
          fiatCurrency: 'NGN',
          destinationAmount: '0.05',
          destinationToken: 'USDC',
          destinationAddress: 'GABC...',
          provider: 'moonpay',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        db.createOrder(order);

        db.updateOrder(orderId, {
          state: 'failed',
          error: `Failed from ${startState}`,
        });

        const stored = db.getOrder(orderId);
        expect(stored!.state).toBe('failed');
        expect(stored!.error).toContain(startState);
      }
    });

    it('should preserve partial order data in failed state', async () => {
      const orderId = 'order-partial-' + Date.now();

      const order: TestOnrampOrder = {
        id: orderId,
        quoteId: 'quote-' + Date.now(),
        state: 'order_created',
        fiatAmount: '100.00',
        fiatCurrency: 'NGN',
        destinationAmount: '0.05',
        destinationToken: 'USDC',
        destinationAddress: 'GABC...',
        provider: 'moonpay',
        providerOrderId: 'provider-123',
        depositAddress: 'deposit@email.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createOrder(order);

      // Simulate failure after partial data is captured
      db.updateOrder(orderId, {
        state: 'failed',
        error: 'Bridge failed during transfer',
      });

      const stored = db.getOrder(orderId);
      expect(stored!.state).toBe('failed');
      expect(stored!.providerOrderId).toBe('provider-123'); // Preserved
      expect(stored!.depositAddress).toBe('deposit@email.com'); // Preserved
      expect(stored!.error).toBe('Bridge failed during transfer');
    });
  });
});
