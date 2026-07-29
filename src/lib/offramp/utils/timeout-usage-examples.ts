import { logger } from '@/lib/logger';
/**
 * Usage examples for withTimeout utility
 * These demonstrate how to apply withTimeout to the key operations
 * mentioned in the acceptance criteria.
 */

import { withTimeout } from './timeout';

// ── SDK Initialization (15s timeout) ────────────────────────────────────────

export async function initializeSDKWithTimeout(initFn: () => Promise<void>) {
  return withTimeout(initFn(), 15000, 'SDK init');
}

// ── Bridge Quote (15s timeout) ──────────────────────────────────────────────

export async function getBridgeQuoteWithTimeout(
  quoteFn: () => Promise<{ receiveAmount: string; fee: string }>,
) {
  return withTimeout(quoteFn(), 15000, 'Bridge quote');
}

// ── Paycrest Order (20s timeout) ────────────────────────────────────────────

export async function createPaycrestOrderWithTimeout(
  orderFn: () => Promise<{ id: string; status: string }>,
) {
  return withTimeout(orderFn(), 20000, 'Paycrest order');
}

// ── Build Transaction (30s timeout) ────────────────────────────────────────

export async function buildTransactionWithTimeout(buildFn: () => Promise<string>) {
  return withTimeout(buildFn(), 30000, 'Build transaction');
}

// ── Submit Transaction (15s timeout) ────────────────────────────────────────

export async function submitTransactionWithTimeout(submitFn: () => Promise<{ txHash: string }>) {
  return withTimeout(submitFn(), 15000, 'Submit transaction');
}

// ── Real-world example combining multiple operations ────────────────────────

export async function executeOfframpFlowWithTimeouts(sourceAddress: string, amount: string) {
  try {
    // Step 1: Get quote (15s)
    const quote = await getBridgeQuoteWithTimeout(async () => {
      // Simulated API call
      return { receiveAmount: '99.50', fee: '0.50' };
    });

    // Step 2: Build transaction (30s)
    const txXdr = await buildTransactionWithTimeout(async () => {
      // Simulated transaction building
      return 'AAAAAgAAAABmXvHaOfxfXwVPTVw+qX...';
    });

    // Step 3: Submit transaction (15s)
    const result = await submitTransactionWithTimeout(async () => {
      // Simulated submission
      return { txHash: '0x123abc...' };
    });

    // Step 4: Create payout order (20s)
    const order = await createPaycrestOrderWithTimeout(async () => {
      // Simulated payout order creation
      return { id: 'order_123', status: 'pending' };
    });

    return {
      success: true,
      quote,
      txHash: result.txHash,
      orderId: order.id,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      logger.error('Operation timed out:', {}, error.message);
      // Handle timeout-specific logic (e.g., retry, user notification)
    }
    throw error;
  }
}
