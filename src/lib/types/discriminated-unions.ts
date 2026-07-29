/**
 * Discriminated unions for type-safe state management
 * See @/lib/transaction-status for canonical status values (TransactionStatus, PayoutStatus, BridgeStatus).
 */

// Transaction states
export type TransactionState =
  | { status: 'pending'; bridgeStatus?: string }
  | { status: 'completed'; completedAt: number }
  | { status: 'failed'; error: string; failedAt: number };

// Payout states
export type PayoutState =
  | { status: 'pending'; orderId: string }
  | { status: 'processing'; orderId: string; progress: number }
  | { status: 'completed'; orderId: string; completedAt: number }
  | { status: 'failed'; orderId: string; error: string; failedAt: number };

// Bridge states
export type BridgeState =
  | { status: 'initiated'; txHash: string }
  | { status: 'confirmed'; txHash: string; confirmations: number }
  | { status: 'released'; txHash: string; releasedAt: number }
  | { status: 'failed'; txHash: string; error: string };

// API Key states
export type ApiKeyState =
  | { status: 'active'; lastUsedAt?: number }
  | { status: 'inactive' }
  | { status: 'revoked'; revokedAt: number }
  | { status: 'expired'; expiredAt: number };

// User states
export type UserState =
  | { status: 'active'; verifiedAt: number }
  | { status: 'pending_verification'; createdAt: number }
  | { status: 'suspended'; reason: string; suspendedAt: number }
  | { status: 'deleted'; deletedAt: number };

// Type guards
export function isTransactionPending(
  state: TransactionState,
): state is { status: 'pending'; bridgeStatus?: string } {
  return state.status === 'pending';
}

export function isTransactionCompleted(
  state: TransactionState,
): state is { status: 'completed'; completedAt: number } {
  return state.status === 'completed';
}

export function isTransactionFailed(
  state: TransactionState,
): state is { status: 'failed'; error: string; failedAt: number } {
  return state.status === 'failed';
}

export function isPayoutPending(
  state: PayoutState,
): state is { status: 'pending'; orderId: string } {
  return state.status === 'pending';
}

export function isPayoutProcessing(
  state: PayoutState,
): state is { status: 'processing'; orderId: string; progress: number } {
  return state.status === 'processing';
}

export function isPayoutCompleted(
  state: PayoutState,
): state is { status: 'completed'; orderId: string; completedAt: number } {
  return state.status === 'completed';
}

export function isPayoutFailed(
  state: PayoutState,
): state is { status: 'failed'; orderId: string; error: string; failedAt: number } {
  return state.status === 'failed';
}

export function isBridgeInitiated(
  state: BridgeState,
): state is { status: 'initiated'; txHash: string } {
  return state.status === 'initiated';
}

export function isBridgeConfirmed(
  state: BridgeState,
): state is { status: 'confirmed'; txHash: string; confirmations: number } {
  return state.status === 'confirmed';
}

export function isBridgeReleased(
  state: BridgeState,
): state is { status: 'released'; txHash: string; releasedAt: number } {
  return state.status === 'released';
}

export function isBridgeFailed(
  state: BridgeState,
): state is { status: 'failed'; txHash: string; error: string } {
  return state.status === 'failed';
}

export function isApiKeyActive(
  state: ApiKeyState,
): state is { status: 'active'; lastUsedAt?: number } {
  return state.status === 'active';
}

export function isApiKeyRevoked(
  state: ApiKeyState,
): state is { status: 'revoked'; revokedAt: number } {
  return state.status === 'revoked';
}

export function isUserActive(state: UserState): state is { status: 'active'; verifiedAt: number } {
  return state.status === 'active';
}

export function isUserSuspended(
  state: UserState,
): state is { status: 'suspended'; reason: string; suspendedAt: number } {
  return state.status === 'suspended';
}
