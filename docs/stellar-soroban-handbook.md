# Stellar / Soroban Developer Handbook

> Practical reference for working with the Stellar SDK and Soroban smart contracts in Stellar-Spend.

---

## Table of Contents

- [Network Selection](#network-selection)
- [Environment Variables](#environment-variables)
- [Wallet Connection](#wallet-connection)
- [XDR Building & Signing](#xdr-building--signing)
- [Horizon vs Soroban RPC](#horizon-vs-soroban-rpc)
- [Fee Estimation](#fee-estimation)
- [Contract Invocation](#contract-invocation)
- [Contracts in This Repo](#contracts-in-this-repo)
- [Common Pitfalls](#common-pitfalls)
- [Debugging Tips](#debugging-tips)
- [Copy-Paste Examples](#copy-paste-examples)

---

## Network Selection

Stellar has three networks. Stellar-Spend targets **Mainnet only** in production.

| Network   | Passphrase                                       | Horizon                                 | Soroban RPC                                           |
| --------- | ------------------------------------------------ | --------------------------------------- | ----------------------------------------------------- |
| Mainnet   | `Public Global Stellar Network ; September 2015` | `https://horizon.stellar.org`           | `https://mainnet.stellar.validationcloud.io/v1/<key>` |
| Testnet   | `Test SDF Network ; September 2015`              | `https://horizon-testnet.stellar.org`   | `https://soroban-testnet.stellar.org`                 |
| Futurenet | `Test SDF Future Network ; September 2015`       | `https://horizon-futurenet.stellar.org` | `https://rpc-futurenet.stellar.org`                   |

Network selection in the wallet adapter (`src/lib/stellar/wallet-adapter.ts`) is enforced at connection time:

```ts
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

// Freighter network check (inside _doConnectFreighter)
const networkDetails = await freighterApi.getNetworkDetails();
if (passphrase && passphrase !== MAINNET_PASSPHRASE) {
  throw new Error(`Freighter is set to ${networkName}. Please switch to Mainnet.`);
}
```

To target testnet during local development, override `STELLAR_SOROBAN_RPC_URL` and `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` in `.env.local`. The wallet passphrase check runs only in the browser; server-side code uses the env vars directly.

---

## Environment Variables

| Variable                              | Side    | Description                                                                |
| ------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `STELLAR_SOROBAN_RPC_URL`             | Server  | Soroban JSON-RPC endpoint for transaction simulation and submission        |
| `STELLAR_HORIZON_URL`                 | Server  | Horizon REST endpoint for account info, fee stats, and transaction history |
| `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | Browser | Browser-safe Soroban RPC (same value, public prefix required)              |
| `NEXT_PUBLIC_STELLAR_USDC_ISSUER`     | Browser | USDC issuer account used for trustline filtering                           |

All variables are validated at startup via `src/lib/env.ts`. A missing required variable throws immediately rather than failing silently at runtime.

---

## Wallet Connection

The singleton `StellarWalletAdapter` (`src/lib/stellar/wallet-adapter.ts`) handles both Freighter and Lobstr.

### Auto-connect (recommended)

```ts
import { getStellarWalletAdapter } from '@/lib/stellar/wallet-adapter';

const adapter = getStellarWalletAdapter();
const wallet = await adapter.connectAuto();
// wallet.type  → "freighter" | "lobstr"
// wallet.publicKey → "G..."
```

`connectAuto` tries Freighter first, falls back to Lobstr, and throws a user-friendly error if neither is installed.

### Connect specific wallet

```ts
const wallet = await adapter.connectFreighter();
// or
const wallet = await adapter.connectLobstr();
```

Concurrent calls are serialised — multiple `connectAuto()` calls while a connection is in progress share the same promise.

### Disconnect

```ts
adapter.disconnect(); // clears internal state; does not revoke wallet permission
```

### React hook

`src/hooks/useStellarWallet.ts` wraps the adapter and exposes `connect`, `disconnect`, `publicKey`, `walletType`, and `error` state for UI components.

---

## XDR Building & Signing

### Bridge transfer (Stellar → Base via Allbridge)

The Allbridge SDK builds the Soroban XDR internally. The API route (`POST /api/offramp/bridge/build-tx`) returns a ready-to-sign XDR:

```ts
// 1. Fetch XDR from the server
const { xdr } = await fetch('/api/offramp/bridge/build-tx', {
  method: 'POST',
  body: JSON.stringify({ amount, fromAddress, toAddress, feePaymentMethod }),
}).then((r) => r.json());

// 2. Sign in the browser with the connected wallet
const adapter = getStellarWalletAdapter();
const signedXdr = await adapter.signTransaction(xdr);

// 3. Submit via the server
const { txHash } = await fetch('/api/offramp/bridge/submit-soroban', {
  method: 'POST',
  body: JSON.stringify({ signedXdr, fromAddress }),
}).then((r) => r.json());
```

### Manual XDR construction with stellar-sdk

```ts
import { Networks, TransactionBuilder, Operation, Account } from '@stellar/stellar-sdk';

const BASE_FEE = '100'; // stroops

const tx = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.PUBLIC,
})
  .addOperation(
    Operation.invokeContractFunction({
      contract: CONTRACT_ID,
      method: 'transfer',
      parameters: [senderScVal, recipientScVal, amountScVal],
    }),
  )
  .setTimeout(30) // seconds; use 0 only in tests
  .build();

const xdr = tx.toXDR(); // hand to the wallet for signing
```

### Signature storage

After a transaction is submitted, the server records the raw signature in the `transaction_signatures` table via `TransactionSigningService` (`src/lib/transaction-signing.ts`):

```ts
import { transactionSigningService } from '@/lib/transaction-signing';

await transactionSigningService.signTransaction(
  transactionId,
  userAddress,
  signature, // hex string
  publicKey, // hex string
  'ed25519',
);
```

---

## Horizon vs Soroban RPC

These are two separate APIs. Use the right one for the job.

| Task                                    | Use                                    |
| --------------------------------------- | -------------------------------------- |
| Fetch account sequence number / balance | **Horizon** `GET /accounts/{id}`       |
| Fetch transaction by hash               | **Horizon** `GET /transactions/{hash}` |
| Fetch fee stats / base fee              | **Horizon** `GET /fee_stats`           |
| Simulate a Soroban contract call        | **Soroban RPC** `simulateTransaction`  |
| Submit a signed transaction             | **Soroban RPC** `sendTransaction`      |
| Get contract events                     | **Soroban RPC** `getEvents`            |
| Poll transaction status after submit    | **Soroban RPC** `getTransaction`       |

### Horizon example

```ts
const HORIZON_URL = process.env.STELLAR_HORIZON_URL!;

// Load account (for sequence number)
const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
const account = await res.json();
```

### Soroban RPC example

```ts
const RPC_URL = process.env.STELLAR_SOROBAN_RPC_URL!;

const res = await fetch(RPC_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'getTransaction',
    params: { hash: txHash },
  }),
});
const { result } = await res.json();
// result.status → "SUCCESS" | "FAILED" | "NOT_FOUND"
```

---

## Fee Estimation

Soroban fees have two parts:

1. **Inclusion fee** — paid to validators, set via `fee` in `TransactionBuilder`. Use Horizon `/fee_stats` for the current network median.
2. **Resource fee** — covers CPU instructions, memory, and ledger I/O. Returned by `simulateTransaction`.

`ResourceFeeEstimator` (`src/lib/stellar/resource-fee-estimator.ts`) wraps the simulation call:

```ts
import { ResourceFeeEstimator } from '@/lib/stellar/resource-fee-estimator';
import { Account } from '@stellar/stellar-sdk';

const estimator = new ResourceFeeEstimator(process.env.STELLAR_SOROBAN_RPC_URL!);

const estimate = await estimator.estimateContractInvocation(
  CONTRACT_ID,
  'transfer',
  [senderScVal, recipientScVal, amountScVal],
  sourceAccount, // stellar-sdk Account object
);

console.log(estimate.estimatedFeeXLM); // e.g. "0.0001234"
console.log(estimate.cpuInstructions); // Soroban resource units
```

Falls back to safe defaults (`estimatedFeeStroops: 1000`) if simulation fails.

### Fee payment options

The Allbridge bridge transaction supports two gas fee methods, selected at quote time:

| Method       | `feePaymentMethod` | Notes                                                         |
| ------------ | ------------------ | ------------------------------------------------------------- |
| XLM (native) | `"native"`         | Deducted from XLM balance; fails if balance < minimum reserve |
| USDC         | `"stablecoin"`     | Deducted from USDC amount; slightly higher amount required    |

Available options are listed by `GET /api/offramp/bridge/gas-fee-options`.

---

## Contract Invocation

Soroban contracts are invoked via `Operation.invokeContractFunction`. Parameters must be encoded as XDR `ScVal` types.

### ScVal helpers (stellar-sdk)

```ts
import { nativeToScVal, scValToNative, Address, xdr } from '@stellar/stellar-sdk';

// Address
const addrScVal = new Address(publicKey).toScVal();

// Integer (i128)
const amountScVal = nativeToScVal(BigInt('1000000'), { type: 'i128' });

// String
const labelScVal = xdr.ScVal.scvString('hello');

// Decode result
const result = scValToNative(simulationResult);
```

### Full invocation pattern

```ts
import { Contract, Networks, TransactionBuilder, Account, rpc } from '@stellar/stellar-sdk';

const server = new rpc.Server(process.env.STELLAR_SOROBAN_RPC_URL!);
const contract = new Contract(CONTRACT_ID);

// Load source account
const account = await server.getAccount(sourcePublicKey);

// Build transaction
const tx = new TransactionBuilder(account, {
  fee: '1000',
  networkPassphrase: Networks.PUBLIC,
})
  .addOperation(contract.call('transfer', addrScVal, amountScVal))
  .setTimeout(30)
  .build();

// Simulate to get resource footprint + fee
const simResult = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(simResult)) throw new Error(simResult.error);

// Assemble (adds resource data returned by simulation)
const preparedTx = rpc.assembleTransaction(tx, simResult).build();
const xdr = preparedTx.toXDR();

// Send to wallet for signing, then submit
const signedXdr = await adapter.signTransaction(xdr);
const sendResult = await server.sendTransaction(
  TransactionBuilder.fromXDR(signedXdr, Networks.PUBLIC),
);
```

---

## Contracts in This Repo

| Contract             | Path                            | Purpose                                                                 |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `escrow`             | `contracts/escrow/`             | Holds USDC in escrow during the bridge window; releases on confirmation |
| `treasury`           | `contracts/treasury/`           | Protocol treasury; accumulates fee revenue                              |
| `fee-manager`        | `contracts/fee-manager/`        | Computes and collects bridge fees                                       |
| `multisig-authority` | `contracts/multisig-authority/` | Multi-signer governance for admin operations                            |

Contracts are written in Rust and compiled to WASM. Deploy with:

```bash
./scripts/deploy-contract.sh <contract-name> <network>
```

### Multi-sig settlement flow

`src/lib/stellar/multisig.ts` implements server-side partial signature collection. A transaction reaches `ready` state once accumulated signer weights meet the configured threshold. The default collection window is **24 hours** (`DEFAULT_SIGNATURE_EXPIRY_MS`).

---

## Common Pitfalls

**1. Sequence number out of date**  
If you build a transaction using a stale sequence number it will be rejected with `tx_bad_seq`. Always fetch the account fresh from Horizon immediately before building.

**2. Forgetting to assemble after simulation**  
`simulateTransaction` returns resource footprint data that must be attached to the transaction before signing. Always call `rpc.assembleTransaction(tx, simResult)` — transactions submitted without it will fail with resource errors.

**3. Timeout = 0 in production**  
`setTimeout(0)` means the transaction never expires. This can clog the mempool and create replay issues. Use `setTimeout(30)` for interactive transactions, `setTimeout(300)` for polling-based flows.

**4. Wrong network passphrase**  
Signing with testnet passphrase and submitting to mainnet (or vice versa) silently fails signature verification. Always use `Networks.PUBLIC` for mainnet.

**5. Insufficient XLM reserve**  
Each account must maintain a base reserve (2 XLM + 0.5 XLM per sub-entry). Transactions that would drop the balance below the reserve are rejected with `op_underfunded`. Check reserve before submitting.

**6. USDC trustline missing**  
An account must have an explicit trustline for USDC (`NEXT_PUBLIC_STELLAR_USDC_ISSUER`) before it can hold or send it. The app filters USDC balances by the configured issuer.

**7. Lobstr provider not on window**  
`resolveLobstrProvider()` reads `window.lobstr` or `window.stellar` (if `isLobstr: true`). If the Lobstr extension is installed but not detected, check that the page loaded over HTTPS and that the extension is active on that origin.

---

## Debugging Tips

**Decode an XDR in the browser console:**

```js
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk';
const tx = TransactionBuilder.fromXDR('<base64-xdr>', Networks.PUBLIC);
console.log(JSON.stringify(tx.toEnvelope().toXDR('base64')));
```

**Inspect a failed simulation:**

```ts
const result = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(result)) {
  console.error('Simulation error:', result.error);
  // result.events may show contract diagnostics
}
```

**Decode contract return value:**

```ts
import { scValToNative } from '@stellar/stellar-sdk';
const native = scValToNative(result.result?.retval);
console.log('Return value:', native);
```

**Poll transaction after submit:**

```ts
let status = sendResult.status; // "PENDING" | "DUPLICATE" | "TRY_AGAIN_LATER" | "ERROR"
while (status === 'PENDING' || status === 'TRY_AGAIN_LATER') {
  await new Promise((r) => setTimeout(r, 2000));
  const check = await server.getTransaction(sendResult.hash);
  status = check.status;
}
// "SUCCESS" | "FAILED" | "NOT_FOUND"
```

**Stellar Lab (testnet only):** https://lab.stellar.org — paste XDR to decode, simulate, and submit interactively.

---

## Copy-Paste Examples

### Full offramp happy-path (client side)

```ts
import { getStellarWalletAdapter } from '@/lib/stellar/wallet-adapter';

async function runOfframp(amount: string, currency: string, bankDetails: object) {
  const adapter = getStellarWalletAdapter();

  // 1. Connect wallet
  const wallet = await adapter.connectAuto();

  // 2. Get quote
  const { rate, bridgeFee } = await fetch('/api/offramp/quote', {
    method: 'POST',
    body: JSON.stringify({ amount, currency, feeMethod: 'USDC' }),
  }).then((r) => r.json());

  // 3. Build transaction XDR
  const { xdr } = await fetch('/api/offramp/bridge/build-tx', {
    method: 'POST',
    body: JSON.stringify({
      amount,
      fromAddress: wallet.publicKey,
      toAddress: process.env.NEXT_PUBLIC_BASE_RETURN_ADDRESS,
      feePaymentMethod: 'stablecoin',
    }),
  }).then((r) => r.json());

  // 4. Sign in wallet
  const signedXdr = await adapter.signTransaction(xdr);

  // 5. Submit
  const { txHash } = await fetch('/api/offramp/bridge/submit-soroban', {
    method: 'POST',
    body: JSON.stringify({ signedXdr, fromAddress: wallet.publicKey }),
  }).then((r) => r.json());

  return txHash;
}
```

### Simulate and estimate resource fee

```ts
import { ResourceFeeEstimator } from '@/lib/stellar/resource-fee-estimator';
import { rpc, Account } from '@stellar/stellar-sdk';

const server = new rpc.Server(process.env.STELLAR_SOROBAN_RPC_URL!);
const estimator = new ResourceFeeEstimator(process.env.STELLAR_SOROBAN_RPC_URL!);

const account = await server.getAccount(publicKey);
const sdkAccount = new Account(publicKey, account.sequenceNumber());

const estimate = await estimator.estimateContractInvocation(
  CONTRACT_ID,
  'transfer',
  [recipientScVal, amountScVal],
  sdkAccount,
);
// estimate.estimatedFeeXLM → "0.0001234"
```
