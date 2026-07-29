// Canonical status and state types for the Stellar-Spend transaction lifecycle

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'reversed'
  | 'partially_reversed';

export type PayoutStatus = 'pending' | 'validated' | 'settled' | 'refunded' | 'expired';

export type BridgeStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export type TradeState =
  | 'draft'
  | 'quoted'
  | 'source_tx_submitted'
  | 'bridge_pending'
  | 'bridge_completed'
  | 'payout_order_created'
  | 'destination_tx_submitted'
  | 'payout_pending'
  | 'completed'
  | 'failed';

export const TRADE_TRANSITIONS: Record<TradeState, readonly TradeState[]> = {
  draft: ['quoted'],
  quoted: ['source_tx_submitted', 'failed'],
  source_tx_submitted: ['bridge_pending', 'failed'],
  bridge_pending: ['bridge_completed', 'failed'],
  bridge_completed: ['payout_order_created', 'failed'],
  payout_order_created: ['destination_tx_submitted', 'failed'],
  destination_tx_submitted: ['payout_pending', 'failed'],
  payout_pending: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  pending: ['validated', 'refunded', 'expired'],
  validated: ['settled', 'refunded', 'expired'],
  settled: [],
  refunded: [],
  expired: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TradeState,
    public readonly to: TradeState,
  ) {
    super(`Invalid trade state transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isValidTransition(from: TradeState, to: TradeState): boolean {
  return (TRADE_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function assertValidTransition(from: TradeState, to: TradeState): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isValidPayoutTransition(from: PayoutStatus, to: PayoutStatus): boolean {
  return (PAYOUT_TRANSITIONS[from] as readonly string[]).includes(to);
}
