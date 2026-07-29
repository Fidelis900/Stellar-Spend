'use client';

import type { StatusPush } from './ws-server';

export type { StatusPush };

export interface WebSocketClient {
  connect(id: string, onMessage: (push: StatusPush) => void, onClose: () => void): () => void;
}

/**
 * Connect to the WebSocket server at /api/offramp/ws/{id}.
 *
 * - Automatically selects ws:// or wss:// based on the current page protocol.
 * - Parses incoming messages as StatusPush objects and forwards them to onMessage.
 * - Responds to server heartbeat pings ({ type: 'ping' }) with { type: 'pong' }.
 * - Calls onClose when the connection closes or errors.
 * - Returns a cleanup function that closes the socket.
 *
 * Requirements: 2.3, 2.4, 2.7
 */
export function connectWebSocket(
  id: string,
  onMessage: (push: StatusPush) => void,
  onClose: () => void,
): () => void {
  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
  const url = `${protocol}//${host}/api/offramp/ws/${id}`;

  const socket = new WebSocket(url);

  socket.addEventListener('message', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);

      // Respond to server heartbeat pings (Requirement 2.7)
      if (data?.type === 'ping') {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      // Forward status push messages to the caller
      if (data && typeof data.id === 'string' && typeof data.status === 'string') {
        onMessage(data as StatusPush);
      }
    } catch {
      // Non-JSON or malformed message — ignore
    }
  });

  socket.addEventListener('close', () => {
    onClose();
  });

  socket.addEventListener('error', () => {
    // The 'close' event fires after 'error', so onClose will be called there.
    // No additional action needed here.
  });

  // Return cleanup function that closes the socket (Requirement 2.3)
  return () => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'client cleanup');
    }
  };
}
