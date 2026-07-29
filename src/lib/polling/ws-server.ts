/**
 * WebSocket server utilities for transaction status push delivery.
 *
 * NOTE: Next.js App Router does not natively support WebSocket upgrades in
 * route handlers. These utilities are designed to be used with a custom
 * Node.js server (e.g. via `scripts/run-next.cjs`) that can intercept the
 * HTTP upgrade event and call `onConnect` directly.
 *
 * The route at /api/offramp/ws/[id] returns 501 when hit via a normal HTTP
 * request, but exports these utilities so the custom server can import and
 * use them.
 */

export interface StatusPush {
  id: string;
  status: string;
  isTerminal: boolean;
  timestamp: number;
}

// Module-level subscriber map: transactionId → Set of connected WebSocket clients
// Property 5: broadcast reaches all subscribers for a given id
const subscribers = new Map<string, Set<WebSocket>>();

// Heartbeat tracking: socket → { pingTimer, pongTimer }
const heartbeats = new Map<
  WebSocket,
  { pingTimer: ReturnType<typeof setTimeout>; pongTimer: ReturnType<typeof setTimeout> | null }
>();

const HEARTBEAT_INTERVAL_MS = 60_000; // 60s of inactivity before ping
const PONG_TIMEOUT_MS = 10_000; // close if pong not received within 10s

function scheduleHeartbeat(socket: WebSocket): void {
  const existing = heartbeats.get(socket);
  if (existing) {
    clearTimeout(existing.pingTimer);
    if (existing.pongTimer) clearTimeout(existing.pongTimer);
  }

  const pingTimer = setTimeout(() => {
    if (socket.readyState !== socket.OPEN) {
      heartbeats.delete(socket);
      return;
    }

    // Send ping
    try {
      // Native WebSocket API uses send; ws library exposes ping()
      // We use a JSON ping message for compatibility with browser WebSocket
      socket.send(JSON.stringify({ type: 'ping' }));
    } catch {
      // Socket already closed
      heartbeats.delete(socket);
      return;
    }

    // Expect pong within 10s
    const pongTimer = setTimeout(() => {
      socket.close(1001, 'pong timeout');
      heartbeats.delete(socket);
    }, PONG_TIMEOUT_MS);

    heartbeats.set(socket, { pingTimer, pongTimer });
  }, HEARTBEAT_INTERVAL_MS);

  heartbeats.set(socket, { pingTimer, pongTimer: null });
}

function cancelHeartbeat(socket: WebSocket): void {
  const entry = heartbeats.get(socket);
  if (entry) {
    clearTimeout(entry.pingTimer);
    if (entry.pongTimer) clearTimeout(entry.pongTimer);
    heartbeats.delete(socket);
  }
}

/**
 * Called when a client connects; subscribes them to updates for `id`.
 * Property 5: all subscribers for an id receive broadcasts.
 */
export function onConnect(id: string, socket: WebSocket): void {
  if (!subscribers.has(id)) {
    subscribers.set(id, new Set());
  }
  subscribers.get(id)!.add(socket);

  // Handle pong responses (reset heartbeat timer)
  socket.addEventListener('message', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);
      if (data?.type === 'pong') {
        const entry = heartbeats.get(socket);
        if (entry?.pongTimer) {
          clearTimeout(entry.pongTimer);
        }
        // Reschedule next heartbeat
        scheduleHeartbeat(socket);
      }
    } catch {
      // Non-JSON message — ignore
    }
  });

  socket.addEventListener('close', () => {
    cancelHeartbeat(socket);
    const set = subscribers.get(id);
    if (set) {
      set.delete(socket);
      if (set.size === 0) subscribers.delete(id);
    }
  });

  scheduleHeartbeat(socket);
}

/**
 * Push a status update to all subscribers for `id`.
 * Property 5: every connected client for `id` receives the payload.
 */
export function broadcast(id: string, payload: StatusPush): void {
  const set = subscribers.get(id);
  if (!set || set.size === 0) return;

  const message = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
      // Reset heartbeat timer on activity
      scheduleHeartbeat(socket);
    }
  }
}

/**
 * Broadcast a terminal status then close all sockets for `id`.
 * Property 8: terminal state closes the WebSocket connection after delivery.
 */
export function closeForId(id: string, finalPayload: StatusPush): void {
  const set = subscribers.get(id);
  if (!set || set.size === 0) return;

  const message = JSON.stringify(finalPayload);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
    cancelHeartbeat(socket);
    socket.close(1000, 'terminal state reached');
  }
  subscribers.delete(id);
}

// Exported for testing
export { subscribers };
