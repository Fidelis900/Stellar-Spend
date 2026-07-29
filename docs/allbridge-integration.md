# Allbridge Integration Guide

This guide covers how Stellar-Spend integrates with the Allbridge Core SDK to bridge USDC from Stellar (Soroban) to Base — including the bridge flow, token mapping, transaction building, status polling, and troubleshooting.

---

## 1. Bridge Flow

The Allbridge integration handles one direction: **Stellar USDC → Base USDC**.

```
User (Stellar wallet)
  │
  ├─ 1. POST /api/offramp/bridge/build-tx
  │       └─ SDK builds Soroban XDR transaction
  │
  ├─ 2. Wallet signs XDR (client-side, Freighter / Lobstr)
  │
  ├─ 3. POST /api/offramp/bridge/submit-soroban
  │       └─ Signed XDR submitted to Soroban RPC → returns txHash
  │
  └─ 4. GET /api/offramp/bridge/status/[txHash]  (polled until terminal)
          └─ Allbridge confirms USDC received on Base
```

Once the bridge confirms `completed`, the server executes the Base USDC transfer to the Paycrest deposit address to fund the payout order.

### SDK Initialization

The SDK is initialized with custom RPC URLs sourced from environment variables:

| Env Variable              | SDK Key | Purpose                 |
| ------------------------- | ------- | ----------------------- |
| `STELLAR_SOROBAN_RPC_URL` | `SRB`   | Soroban contract calls  |
| `STELLAR_HORIZON_URL`     | `STLR`  | Stellar Horizon queries |
| `BASE_RPC_URL`            | `ETH`   | Base chain interaction  |

The adapter (`allbridge-adapter.ts`) maintains a **module-level SDK singleton** and a **5-minute TTL cache** for `chainDetailsMap` and token info to avoid redundant network calls.

```ts
// Cache is invalidated automatically on any SDK error
import {
  initializeAllbridgeSdk,
  invalidateSdkCache,
} from '@/lib/offramp/adapters/allbridge-adapter';

const sdk = initializeAllbridgeSdk(); // returns cached instance on repeat calls
```

---

## 2. Token Mapping

Allbridge identifies chains and tokens by internal chain symbols. The two chains used in this integration are:

| Chain             | Allbridge Symbol | Token | Role        |
| ----------------- | ---------------- | ----- | ----------- |
| Stellar (Soroban) | `SRB`            | USDC  | Source      |
| Base              | `BAS`            | USDC  | Destination |

### Resolving Tokens

Token objects are resolved from `sdk.chainDetailsMap()` by matching `symbol === 'USDC'`:

```ts
const chainDetailsMap = await sdk.chainDetailsMap();

const stellarChain = chainDetailsMap.SRB;
const sourceToken = stellarChain.tokens.find((t) => t.symbol === 'USDC');

const baseChain = chainDetailsMap.BAS;
const destinationToken = baseChain.tokens.find((t) => t.symbol === 'USDC');
```

Both `sourceToken` and `destinationToken` are `TokenWithChainDetails` objects. They carry the contract address, decimals, and chain metadata required by all subsequent SDK calls.

**Errors thrown if tokens are missing:**

- `'Stellar chain (SRB) not found in Allbridge chain details'`
- `'USDC token not found on Stellar chain'`
- `'Base chain (BAS) not found in Allbridge chain details'`
- `'USDC token not found on Base chain'`

---

## 3. Transaction Building

### Step 1 — Fetch Gas Fee Options

Before building the transaction, fetch the available fee options:

**Route:** `GET /api/offramp/bridge/gas-fee-options`

**Response** (cached for 60 seconds):

```json
{
  "feeOptions": {
    "native": { "int": "1000000", "float": "1.0" },
    "stablecoin": { "int": "500000", "float": "0.5" }
  }
}
```

Two fee payment methods are supported:

| Method                 | Description                            | `gasAmount`      | `feeTokenAmount`     |
| ---------------------- | -------------------------------------- | ---------------- | -------------------- |
| `stablecoin` (default) | Fee paid in USDC — no extra XLM needed | `"0"`            | stablecoin int value |
| `native`               | Fee paid in XLM                        | native int value | `"0"`                |

Use `getBridgeFeeForMethod(feeOptions, method)` from `allbridge-extensions.ts` to select the correct fee parameters.

### Step 2 — Build the XDR

**Route:** `POST /api/offramp/bridge/build-tx`

**Request body:**

```json
{
  "amount": "100",
  "fromAddress": "G...",
  "toAddress": "0x...",
  "feePaymentMethod": "stablecoin"
}
```

| Field              | Type                         | Validation                   |
| ------------------ | ---------------------------- | ---------------------------- |
| `amount`           | string                       | Must be a positive number    |
| `fromAddress`      | string                       | Valid Stellar (G...) address |
| `toAddress`        | string                       | Valid Base (0x...) address   |
| `feePaymentMethod` | `"native"` \| `"stablecoin"` | Defaults to `"stablecoin"`   |

**Successful response:**

```json
{
  "xdr": "AAAAAgAAAA...",
  "sourceToken": { "symbol": "USDC", "decimals": 6, "contract": "C...", "chain": "SRB" },
  "destinationToken": { "symbol": "USDC", "decimals": 6, "contract": "0x...", "chain": "BAS" }
}
```

Internally, the route calls `sdk.buildSwapAndBridgeTx(sourceToken, destinationToken, fromAddress, toAddress, amount, selectedFee)` to produce the Soroban XDR.

### Step 3 — Sign (Client-Side)

The XDR is returned to the browser, where the user's wallet (Freighter or Lobstr) signs it. No private keys are handled server-side at this step.

### Step 4 — Submit the Signed XDR

**Route:** `POST /api/offramp/bridge/submit-soroban`

**Request body:**

```json
{ "signedXdr": "AAAAAgAAAA..." }
```

The route submits the XDR to the Soroban RPC via JSON-RPC `sendTransaction` and returns:

```json
{ "status": "PENDING", "hash": "abc123..." }
```

| RPC Status                  | Returned Status | Meaning                                  |
| --------------------------- | --------------- | ---------------------------------------- |
| `PENDING`                   | `PENDING`       | Transaction accepted, awaiting inclusion |
| `SUCCESS`                   | `SUCCESS`       | Transaction included in ledger           |
| `DUPLICATE`                 | `PENDING`       | Already submitted; treat as pending      |
| `ERROR` / `TRY_AGAIN_LATER` | `400` error     | Transaction rejected                     |

---

## 4. Status Polling

Once you have a `txHash`, poll the bridge status until a terminal state is reached.

**Route:** `GET /api/offramp/bridge/status/[txHash]`

**Response:**

```json
{
  "data": {
    "status": "processing",
    "txHash": "abc123...",
    "receiveAmount": "99.5"
  }
}
```

### Status Values

| Allbridge Raw Status         | Internal `BridgeStatus` | Terminal? |
| ---------------------------- | ----------------------- | --------- |
| `pending` / `waiting`        | `pending`               | No        |
| `processing` / `in_progress` | `processing`            | No        |
| `completed` / `success`      | `completed`             | ✅ Yes    |
| `failed` / `error`           | `failed`                | ✅ Yes    |
| `expired`                    | `expired`               | ✅ Yes    |

**Polling strategy:**

- Poll every 5–10 seconds.
- Stop when status is `completed`, `failed`, or `expired`.
- A `404` from Allbridge (transaction not yet indexed) is handled gracefully — the route returns `pending` rather than an error.

### `getAllbridgeTransferStatus` (adapter utility)

```ts
import { getAllbridgeTransferStatus } from '@/lib/offramp/utils/allbridge-extensions';

const result = await getAllbridgeTransferStatus(sdk, 'SRB', txHash);
// { status: 'processing', txHash: '...', receiveAmount?: '99.5' }
```

Errors inside this function are caught and return `{ status: 'pending', txHash }` rather than throwing — safe to call in a polling loop.

---

## 5. Troubleshooting

### "Insufficient XLM balance for native gas fee"

Full message: `resulting balance is not within the allowed range`

**Cause:** Paying the bridge fee in XLM would push the account below Stellar's minimum reserve.

**Fix:** Switch `feePaymentMethod` to `"stablecoin"`. This pays the fee in USDC and requires no extra XLM.

---

### "A token transfer in the bridge contract failed during simulation"

**Cause:** The USDC balance is insufficient to cover `amount + stablecoin fee`.

**Fix:** Reduce the bridge amount, or ensure the wallet holds enough USDC to cover both the transfer and the fee.

---

### "Failed to fetch chain details from Allbridge"

**Cause:** `sdk.chainDetailsMap()` returned without `SRB` or `BAS` keys, or the SDK call timed out.

**Fix:**

1. Verify `STELLAR_SOROBAN_RPC_URL` and `STELLAR_HORIZON_URL` are set and reachable.
2. The SDK cache is invalidated automatically on error — the next request will re-initialize.
3. Check Allbridge service status if the issue persists.

---

### "USDC token not found on one or both chains"

**Cause:** Allbridge's token list changed, or the chain details response was incomplete.

**Fix:** Call `invalidateSdkCache()` to force a fresh fetch on the next request. If the problem persists, check the Allbridge SDK changelog for token symbol changes.

---

### Soroban RPC submission errors

| Error                      | Likely Cause                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `TRY_AGAIN_LATER`          | Network congestion; retry after a few seconds                     |
| `DUPLICATE`                | Transaction already submitted; poll status with the existing hash |
| `ERROR` + `errorResultXdr` | Contract execution failed; decode XDR for details                 |

Diagnostic events are logged server-side on `ERROR` status — check server logs for `Diagnostic events:` entries.

---

### SDK cache not refreshing

The module-level singleton and caches persist for the lifetime of the server process. If you deploy a config change (e.g., new RPC URL), restart the server or call `invalidateSdkCache()` to force re-initialization.

---

## 6. Adapter Pattern

Allbridge is implemented as a **concrete adapter** conforming to `BridgeProviderAdapter`:

```ts
// src/lib/offramp/adapters/bridge-provider.ts
export interface BridgeProviderAdapter {
  getQuote(request): Promise<Quote>;
  buildSendTx(request): Promise<unknown>;
  getTransferStatus(transferId): Promise<Status>;
  getAverageTransferTime(src, dst): number;
  getHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}
```

The `allbridge-adapter.ts` module exports stateless functions rather than a class (the SDK is a module-level singleton), but it conforms to the same contract via wrapper functions in the route handlers.

### Provider Registry

The `BridgeProviderRegistry` (in `src/lib/offramp/adapters/provider-registry.ts`) manages all bridge and payout providers:

```ts
import { providerRegistry } from '@/lib/offramp/adapters/provider-registry';

// Register providers
providerRegistry.registerBridge('allbridge', allbridgeAdapter);

// Get eligible providers for a corridor
const bridges = providerRegistry.getEligibleBridges('stellar→base');

// Check health
const health = await providerRegistry.checkBridgeHealth('allbridge');
```

### Per-Corridor Routing

```ts
providerRegistry.configureRoutes([
  {
    corridor: 'stellar→base',
    sourceChain: 'stellar',
    destinationChain: 'base',
    token: 'USDC',
    bridgeProvider: 'allbridge',
    priority: 1,
  },
]);
```

## Running Tests

```bash
npx vitest run src/test/bridge-build-tx.test.ts
```

The test suite mocks `@allbridge/bridge-core-sdk` entirely — no real RPC calls are made. Key scenarios covered:

- Happy path: returns `{ xdr, sourceToken, destinationToken }`
- Invalid amount → `400`
- Invalid Stellar address → `400`
- Invalid Base address → `400`
- SDK error → `500` with user-friendly message
