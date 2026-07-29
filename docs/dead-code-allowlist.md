# Dead-Code Allowlist

These exports are intentional and may appear unused in static analysis:

## Public API surface (`src/lib/index.ts`)

All exports from `src/lib/index.ts` are intentionally public for consumers.

## Type-only exports

- `TransactionStatus`, `PayoutStatus`, `BridgeStatus`, `TradeState` — consumed by client-side code and external callers
- Branded types (`UserId`, `TransactionId`, etc.) — used for type safety at compile time

## Utility hooks

- `useStellarWallet`, `usePollBridgeStatus`, `usePollPayoutStatus` — consumed by Next.js pages

## Design system

- `src/components/design-system/*` — consumed by Storybook and future consumers

## Stories

- `src/stories/*` — Storybook only, excluded from knip analysis
