# Stellar-Spend User Guide

Convert your Stellar stablecoins (USDC / USDT) to fiat currency and receive funds directly in your bank account — non-custodial, real-time, global.

> **In-app help:** Click the **?** icon anywhere in the app to open the interactive Help Center, which covers all topics in this guide with search and category filters.

> **Note for maintainers:** Sections marked `[SCREENSHOT]` are placeholders. Replace them with actual screenshots or GIFs once the UI is stable.

---

## Table of Contents

1. [What You Need](#what-you-need)
2. [Connecting Your Wallet](#connecting-your-wallet)
3. [Making a Conversion](#making-a-conversion)
4. [Fees Explained](#fees-explained)
5. [Supported Currencies & Banks](#supported-currencies--banks)
6. [Transaction Status Tracking](#transaction-status-tracking)
7. [Transaction History](#transaction-history)
8. [Refunds & Failed Transactions](#refunds--failed-transactions)
9. [Security](#security)
10. [FAQ](#faq)
11. [Troubleshooting](#troubleshooting)

---

## What You Need

Before you start:

- A **Freighter** or **Lobstr** Stellar wallet browser extension, installed and set to **Mainnet**
- **USDC on Stellar** (the token you'll be converting) — minimum 0.70 USDC
- A small amount of **XLM** for Stellar network fees (unless you pay fees in USDC)
- Your **bank account details**: account number and the name of your bank

---

## Connecting Your Wallet

### Step 1 — Open the app

Navigate to the app URL. Click **CONNECT WALLET** in the top-right header.

`[SCREENSHOT: Dashboard on first load with Connect Wallet button highlighted]`

### Step 2 — Choose your wallet

The app auto-detects installed wallets:

- **Freighter** takes priority if both are installed
- **Lobstr** is available as an alternative

Your wallet extension opens and asks you to approve the connection.

`[SCREENSHOT: Wallet selection modal]`

### Step 3 — Approve the connection

Click **Connect** (or **Approve**) in your wallet extension. Once connected, the header shows:

- Your wallet address (truncated, e.g. `GABC…XYZ`)
- Your USDC and XLM balances
- Which wallet is connected

`[SCREENSHOT: Header showing connected wallet address and balances]`

### Switching wallets

To switch, click your address in the header → **Disconnect**, then reconnect with the other wallet.

### Troubleshooting wallet connection

| Symptom             | Fix                                        |
| ------------------- | ------------------------------------------ |
| Button does nothing | Install the extension and refresh the page |
| "Wrong network"     | Switch to Mainnet in wallet settings       |
| Connection lost     | Click your address → Reconnect             |

---

## Making a Conversion

`[GIF: Full offramp flow from amount entry to completion confirmation]`

### Step 1 — Enter the amount

Type the USDC amount you want to convert **or** switch to fiat-amount mode (click the toggle icon) to enter the target fiat amount instead.

The right panel shows a live quote including:

- Exchange rate (USDC → fiat)
- Fee breakdown
- Estimated fiat payout
- Estimated completion time (5–15 min)

`[SCREENSHOT: Form with amount entered showing live quote in right panel]`

> Quotes are valid for **5 minutes** and refresh automatically.

### Step 2 — Select currency and bank

1. Choose your fiat currency (NGN, KES, GHS, ZAR, …)
2. Select your bank from the list
3. Enter the beneficiary account number
4. The app verifies the account and displays the account holder's name

`[SCREENSHOT: Form showing verified account name after entering account number]`

> Always confirm the displayed name matches your intended recipient before proceeding.

### Step 3 — Choose the gas fee method

| Option                 | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| **USDC** (recommended) | Bridge fee deducted from your USDC. No extra XLM beyond the minimum reserve. |
| **XLM**                | Fee paid in XLM. Requires ~3 XLM reserve + ~2.5 XLM for gas.                 |

`[SCREENSHOT: Fee method toggle]`

### Step 4 — Review and confirm

The right panel summarises:

- Amount sent (USDC)
- Bridge fee + platform fee + network fee
- Final fiat payout amount
- Estimated time

Click **Send** when ready.

`[SCREENSHOT: Right panel with full quote summary]`

### Step 5 — Sign in your wallet

A progress modal appears. The app builds the Soroban transaction and your wallet extension asks you to sign it.

`[SCREENSHOT: Progress modal at "Awaiting Wallet Signature" step]`

Click **Sign** in your wallet. Do not close the browser while the transaction is processing.

### Step 6 — Wait for completion

| Stage                | Description                        | Typical Duration |
| -------------------- | ---------------------------------- | ---------------- |
| Submitting           | Signed transaction sent to Stellar | < 30 seconds     |
| Processing On-Chain  | Allbridge bridges USDC to Base     | 1–5 minutes      |
| Settling Fiat Payout | Paycrest initiates bank transfer   | 1–10 minutes     |
| Complete ✓           | Funds credited to bank account     | —                |

`[SCREENSHOT: Progress modal showing Transaction Complete success state]`

---

## Fees Explained

All fees are displayed before you confirm. There are no hidden charges.

| Fee          | Amount     | Description                                       |
| ------------ | ---------- | ------------------------------------------------- |
| Bridge fee   | ~0.3–0.5%  | Allbridge cross-chain conversion (Stellar → Base) |
| Platform fee | 0.35%      | Operational costs and compliance                  |
| Network fee  | ~2.50 USDC | Stellar + Base gas (paid in XLM or USDC)          |
| Payout fee   | 0%         | Paycrest bank settlement — no additional charge   |

**Example** — 100 USDC to NGN:

- Bridge fee: ~0.40 USDC
- Platform fee: 0.35 USDC
- Network fee: ~2.50 USDC
- Net USDC to Paycrest: ~96.75 USDC → converted at live rate

---

## Supported Currencies & Banks

Current fiat corridors:

| Currency | Country      |
| -------- | ------------ |
| NGN      | Nigeria      |
| KES      | Kenya        |
| GHS      | Ghana        |
| ZAR      | South Africa |

Additional corridors are added regularly. The currency list in the app is fetched live and always up to date.

To request a new corridor, open an issue on the repository.

---

## Transaction Status Tracking

After confirming, track your transaction:

- **Live progress modal** — shown on the main page during active transactions
- **/history page** — full history with searchable, filterable status badges
- **Notifications** — push or email alerts (configure in Settings → Notifications)

Status stages:

```
Pending → Bridging → Settling → Processing → Complete
```

If the status is stuck for more than 30 minutes, see [Troubleshooting](#troubleshooting) or contact support.

---

## Transaction History

Visit **/history** for your full transaction record.

`[SCREENSHOT: /history page showing filtered transaction list]`

Features:

- Filter by date, currency, status, amount
- Export to CSV, PDF, or JSON
- View itemised receipts with exchange rate
- Copy transaction hashes for on-chain verification
- File disputes for problematic transactions

Transaction data is stored in your browser's `localStorage` and optionally synced to the server (Settings → Sync Account).

---

## Refunds & Failed Transactions

### Bridge fails (before Base confirmation)

Your Stellar USDC is automatically refunded within 30 minutes.

### Payout fails (after bridge)

Base USDC is returned to the refund address. Contact support with the transaction hash.

### Manual refund request

1. Go to /history
2. Click the transaction
3. Click **Request Refund** (visible within 24 hours of initiation)
4. Submit the reason

---

## Security

Stellar-Spend is **non-custodial**:

- Your private key never leaves your wallet extension
- All transactions are signed locally
- The server never holds your funds
- HTTPS-only communication
- HMAC-verified webhooks

**We will never ask for your seed phrase or private key.**

For more details, see [docs/security-best-practices.md](./security-best-practices.md).

---

## FAQ

**Which wallets are supported?**
Freighter and Lobstr. Freighter is used if both are installed.

**Which tokens can I convert?**
USDC and USDT (Stellar-issued). The app bridges to Base USDC before the fiat payout.

**What is the minimum transfer amount?**
0.70 USDC. We recommend at least $10 USDC for meaningful payouts after fees.

**How long does a conversion take?**
5–15 minutes under normal conditions. Weekend bank transfers may take until the next business day.

**Do I need KYC?**
Transfers up to $150 USDC require no KYC. Tier 1 KYC allows up to $500; Tier 2 removes limits. Configure in Settings → KYC & Limits.

**What are the fees?**
Bridge ~0.4%, platform 0.35%, network ~2.50 USDC fixed. All shown before confirmation.

**What if the transaction fails mid-way?**

- Before Stellar submission: wallet is not debited.
- Bridge failure: Allbridge refunds to your Stellar address (up to 24 hours).
- Payout failure: Paycrest refunds via the return address. Contact support with your order ID.

**Is my private key ever sent to the server?**
No. The extension signs locally; only the signed XDR is sent to the server.

**Why does the app need my account name?**
Paycrest requires a verified name to process the bank transfer. The app looks it up automatically.

---

## Troubleshooting

### "Connect Wallet" button does nothing

Install [Freighter](https://www.freighter.app/) or [Lobstr](https://lobstr.co/), refresh, and try again.

### "Freighter is set to Testnet"

Open Freighter → Settings → Network → select **Mainnet (Public)**.

### "Insufficient USDC balance"

Your USDC balance is less than the entered amount. Reduce the amount or top up.

### "Insufficient XLM for gas"

Switch the fee method to **USDC**, or add more XLM to your wallet.

### "Bridge quote unavailable" (502)

Allbridge is temporarily unreachable. Retry in 30 seconds or check [allbridge.io](https://allbridge.io).

### "FX rate unavailable" (502)

Paycrest rate API is down. Retry shortly.

### "Simulation failed: resulting balance not within allowed range"

USDC balance is too low to cover the transfer + fees. Reduce the amount.

### Transaction stuck on "Processing On-Chain" > 15 minutes

1. Copy your Stellar transaction hash from history.
2. Check [Allbridge Explorer](https://core.allbridge.io/explorer).
3. If marked failed, Allbridge will auto-refund to your Stellar address.

### Transaction stuck on "Settling Fiat Payout" > 30 minutes

Bank processing can be delayed. Contact Paycrest support with your order ID from /history.

### Transaction history is empty after reconnecting

History is in `localStorage`. It is browser- and device-specific. Enable account sync in Settings to persist across devices.

### "Bundle size CI failure"

Run `npm run build:analyze` to find large chunks. Use dynamic imports for non-critical code.

---

_For further help, contact: support@stellar-spend.io or open an issue on the repository._
