/**
 * Polling module exports
 */

// Polling manager
export {
  usePollingManager,
  DurationExceededError,
  ConsecutiveErrorsExceededError,
  AbortError,
} from './polling-manager';
export type { PollingState, StatusResponse } from './polling-manager';

// Backoff
export {
  calculateBackoff,
  backoffCalculator,
  BRIDGE_CONFIG,
  PAYOUT_CONFIG,
} from './backoff';
export type { PollingConfig, BackoffCalculator } from './backoff';

// WebSocket client
export { connectWebSocket } from './websocket-client';
export type { WebSocketClient, StatusPush } from './websocket-client';

// WebSocket server
export { onConnect, broadcast, closeForId } from './ws-server';
export type { StatusPush as WsStatusPush } from './ws-server';

// Status cache
export { get, set, isFresh } from './status-cache';
