import type { Transaction } from '@/lib/transaction-storage';
import type { TransactionStatus, BridgeStatus, PayoutStatus } from '@/lib/transaction-status';
import { getDefaultRng, type Rng } from './rng';

// ── Stellar / Base address helpers ───────────────────────────────────────────

const STELLAR_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function makeStellarAddress(rng: Rng = getDefaultRng()): string {
  let addr = 'G';
  for (let i = 0; i < 55; i++) addr += rng.pick(STELLAR_CHARS.split(''));
  return addr;
}

export function makeBaseAddress(rng: Rng = getDefaultRng()): string {
  return '0x' + rng.hex(20);
}

export function makeStellarTxHash(rng: Rng = getDefaultRng()): string {
  return rng.hex(32);
}

// ── Core factory ─────────────────────────────────────────────────────────────

let _counter = 0;

export function makeTransaction(
  overrides: Partial<Transaction> = {},
  rng: Rng = getDefaultRng(),
): Transaction {
  const n = ++_counter;
  const ts = 1_700_000_000_000 + n * 1000; // deterministic, monotonic
  return {
    id: `tx_test_${n.toString().padStart(4, '0')}`,
    timestamp: ts,
    userAddress: makeStellarAddress(rng),
    amount: '100.00',
    currency: 'USDC',
    feeMethod: 'stablecoin',
    bridgeFee: '0.50',
    networkFee: '0.00',
    paycrestFee: '0.00',
    totalFee: '0.50',
    beneficiary: {
      institution: 'Test Bank',
      accountIdentifier: '0123456789',
      accountName: 'Alice Tester',
      currency: 'NGN',
    },
    status: 'pending',
    ...overrides,
  };
}

// ── Traits ───────────────────────────────────────────────────────────────────

export function pendingTransaction(overrides: Partial<Transaction> = {}, rng?: Rng): Transaction {
  return makeTransaction({ status: 'pending' as TransactionStatus, ...overrides }, rng);
}

export function completedTransaction(overrides: Partial<Transaction> = {}, rng?: Rng): Transaction {
  const rng_ = rng ?? getDefaultRng();
  return makeTransaction(
    {
      status: 'completed' as TransactionStatus,
      bridgeStatus: 'completed' as BridgeStatus,
      payoutStatus: 'settled' as PayoutStatus,
      stellarTxHash: makeStellarTxHash(rng_),
      payoutOrderId: `order_${rng_.alpha(8)}`,
      finalizedAt: Date.now(),
      ...overrides,
    },
    rng_,
  );
}

export function failedTransaction(overrides: Partial<Transaction> = {}, rng?: Rng): Transaction {
  return makeTransaction(
    { status: 'failed' as TransactionStatus, error: 'Bridge transfer failed', ...overrides },
    rng,
  );
}

export function transactionWithBridge(
  overrides: Partial<Transaction> = {},
  rng?: Rng,
): Transaction {
  const rng_ = rng ?? getDefaultRng();
  return makeTransaction(
    {
      bridgeStatus: 'completed' as BridgeStatus,
      stellarTxHash: makeStellarTxHash(rng_),
      ...overrides,
    },
    rng_,
  );
}

// ── Sequence factory ─────────────────────────────────────────────────────────

/** Create N transactions with optional per-item overrides */
export function makeTransactions(
  count: number,
  overrides: Partial<Transaction> = {},
  rng?: Rng,
): Transaction[] {
  return Array.from({ length: count }, () => makeTransaction(overrides, rng));
}

/** Reset the internal counter (call in beforeEach for fully deterministic IDs) */
export function resetTransactionCounter(): void {
  _counter = 0;
}
