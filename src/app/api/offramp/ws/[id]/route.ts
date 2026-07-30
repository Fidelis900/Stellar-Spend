/**
 * WebSocket upgrade endpoint for transaction status push.
 *
 * Next.js App Router does not natively support WebSocket upgrades in route
 * handlers. This route returns 501 Not Implemented when accessed via a
 * standard HTTP request.
 *
 * To enable WebSocket support, use a custom Node.js server that intercepts
 * the HTTP upgrade event and calls the utilities exported from
 * `src/lib/polling/ws-server.ts` directly.
 *
 * Example (custom server):
 *   import { onConnect } from '@/lib/polling';
 *   server.on('upgrade', (req, socket, head) => {
 *     const id = extractIdFromUrl(req.url);
 *     wss.handleUpgrade(req, socket, head, (ws) => onConnect(id, ws as unknown as WebSocket));
 *   });
 */

export { onConnect, broadcast, closeForId } from '@/lib/polling';
export type { StatusPush } from '@/lib/polling';

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: 'WebSocket upgrade not supported in Next.js App Router route handlers.',
      hint: 'Use a custom Node.js server and import { onConnect, broadcast, closeForId } from @/lib/polling/ws-server.',
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
