# ADR-010: Real-Time Transport — WebSocket vs Server-Sent Events

**Status:** Accepted  
**Date:** 2026-06-27  
**Deciders:** Stellar-Spend core team

---

## Context

Transaction status updates (pending → bridging → settling → complete) happen asynchronously over 5–15 minutes. The current implementation polls the status API on a configurable interval. Polling has drawbacks:

- Unnecessary server load at high frequency
- Perceptible latency between status change and UI update
- Polling interval is a manual trade-off between responsiveness and load

We evaluated replacing or augmenting polling with a persistent connection approach so the server can push status updates to the client immediately when they occur.

Options evaluated:

**Option A: Keep client-side polling (status quo)**  
`usePollBridgeStatus` and `usePollPayoutStatus` hooks, 3–5 second intervals. Simple; no server infrastructure changes. Scales linearly with active transactions.

**Option B: Server-Sent Events (SSE)**  
HTTP/1.1 `text/event-stream`. Server pushes events; client subscribes. Uni-directional (server → client). Works through most proxies and CDNs without special configuration.

**Option C: WebSocket**  
Full-duplex connection. Supports both server-push and client messages. More complex infrastructure; requires sticky sessions or a pub-sub broker when scaled horizontally.

**Option D: Long-polling**  
Client holds an open request; server responds when a new event is available. More complex than SSE for similar uni-directional use cases.

---

## Decision

Adopt a **hybrid approach**: SSE as the primary real-time channel, with polling as a fallback.

### Rationale

Transaction status updates are strictly **server → client** (uni-directional). The client does not need to send messages over the real-time channel — it uses REST endpoints for all mutations. This makes WebSocket's bi-directional capability unnecessary overhead.

SSE:

- Works over standard HTTP/1.1; no special proxy/firewall treatment
- Automatically reconnects on disconnect (browser-native)
- Stateless server implementation — each SSE endpoint streams events for a specific `orderId`
- Easy to implement on Next.js with `ReadableStream` in a Route Handler

### Architecture

```
Client (useOfframpSocket)
    │
    ├─ Connects to: GET /api/offramp/ws/[id]   (SSE endpoint)
    │
    └─ On disconnect or SSE error: falls back to polling (useGenericPolling)

Server (src/app/api/offramp/ws/[id]/route.ts)
    │
    ├─ Holds open ReadableStream for orderId
    │
    └─ src/lib/polling/ws-server.ts broadcasts events when:
         - Paycrest webhook arrives (order status change)
         - Bridge status poll detects a change
```

The `useOfframpSocket` hook (`src/hooks/useOfframpSocket.ts`) connects to the SSE endpoint and exposes a `status` value identical to what polling would produce. This allows seamless migration — callers don't change.

### Fallback strategy

If the SSE connection fails (network error, browser limitation, proxy timeout):

- `useOfframpSocket` sets `connected = false`
- The component falls back to `useGenericPolling` at 5-second intervals
- When SSE reconnects, polling stops

### Scaling considerations

The current SSE implementation holds connections in-process. For horizontal scaling (multiple server replicas):

- Order status changes must be broadcast via a shared pub-sub channel (Redis Pub/Sub or similar)
- Each replica subscribes to the channel and forwards matching events to its connected SSE streams
- This is a deferred concern; single-instance deployment is the current production topology

---

## Consequences

**Positive:**

- Near-instant status updates for users (< 500 ms from webhook receipt to UI update)
- Lower server load than 3-second polling for active transactions
- SSE reconnects automatically — no client-side retry logic needed
- Fallback to polling ensures no regression for proxy-limited environments

**Negative / Trade-offs:**

- SSE connections consume a file descriptor and memory per active transaction; with many concurrent users this requires connection limits or keepalive timeouts
- Horizontal scaling requires a pub-sub layer (deferred)
- SSE does not work over HTTP/2 multiplexing in all browsers without a polyfill
- The in-process broadcast model (`ws-server.ts`) is a leaky abstraction that must be replaced before horizontal scaling

**Not adopted:** WebSocket was not chosen because the use case is uni-directional and SSE is simpler to operate at current scale. WebSocket remains an option if bi-directional real-time features (e.g., collaborative session, live chat support) are added.

---

_Related: [[ADR-004-api-versioning-strategy]], [[ADR-009-provider-abstraction-routing]]_
