import type { HelpTopic } from '@/components/HelpModal';

// Topics are organized by user journey:
// 1. Getting Started  2. Wallet  3. Sending Money  4. Fees  5. Currencies & Banks
// 6. Status & Tracking  7. Refunds & Failures  8. Security  9. FAQs  10. Troubleshooting

export const HELP_TOPICS: HelpTopic[] = [
  // ── 1. GETTING STARTED ─────────────────────────────────────────────────────
  {
    id: 'getting-started',
    category: 'getting-started',
    title: 'Getting Started',
    content: `Welcome to Stellar-Spend!

Stellar-Spend lets you convert Stellar stablecoins (USDC / USDT) into local fiat currency and receive funds directly in your bank account.

Quick start:
1. Connect your Stellar wallet (Freighter or Lobstr)
2. Enter the USDC amount you want to convert
3. Select your destination currency and bank
4. Enter your bank account details
5. Review the rate and fees, then confirm in your wallet
6. Funds settle to your bank in 5–15 minutes

Requirements:
• Minimum transfer: 0.70 USDC
• A Stellar wallet with USDC balance
• Enough XLM for network fees (if paying gas in XLM)
• Your wallet must be on Mainnet (not Testnet)`,
    keywords: ['start', 'begin', 'first time', 'setup', 'how to', 'new user', 'quick start'],
  },
  {
    id: 'what-is-stellar-spend',
    category: 'getting-started',
    title: 'What is Stellar-Spend?',
    content: `Stellar-Spend is a non-custodial off-ramp application.

Non-custodial means:
• We never hold your funds at any point
• All transactions are signed by you in your own wallet
• You remain in full control of your assets

How it works:
1. Your USDC travels from Stellar → Base chain via Allbridge
2. The server sends Base USDC to Paycrest
3. Paycrest converts it to fiat and initiates a bank transfer
4. Your beneficiary receives local currency (NGN, KES, GHS, …)

Supported stablecoins: USDC, USDT (Stellar-issued)`,
    keywords: ['what is', 'about', 'non-custodial', 'how it works', 'overview', 'introduction'],
  },

  // ── 2. WALLET ──────────────────────────────────────────────────────────────
  {
    id: 'wallet-connection',
    category: 'wallet',
    title: 'Connecting Your Wallet',
    content: `Stellar-Spend supports Freighter and Lobstr wallets.

To connect:
1. Click "CONNECT WALLET" in the top-right corner
2. Choose Freighter or Lobstr
3. Approve the connection request in your wallet extension
4. Your public key will appear in the header

Freighter setup:
• Install from freighter.app
• Create or import a Stellar account
• Switch the network to Mainnet (Settings → Network → Mainnet)

Lobstr setup:
• Use the Lobstr browser extension or mobile companion
• Approve the WalletConnect pairing request

Troubleshooting:
• "Extension not installed" — install the extension and refresh
• "Wrong network" — switch to Mainnet in wallet settings
• Connection lost — click the wallet address to reconnect`,
    keywords: [
      'wallet',
      'connect',
      'freighter',
      'lobstr',
      'extension',
      'walletconnect',
      'disconnect',
      'pairing',
    ],
  },
  {
    id: 'wallet-balance',
    category: 'wallet',
    title: 'Wallet Balance & Minimum Reserve',
    content: `Your Stellar account must maintain a minimum XLM reserve.

Stellar requires every account to hold a base reserve (currently 1 XLM) plus 0.5 XLM per trustline. Attempting to drop below the reserve will cause the transaction to fail.

If you see "Insufficient XLM balance for native gas fee":
• Switch the gas fee payment to USDC instead of XLM
• Add more XLM to your account
• Reduce the transfer amount slightly

USDC balance shown in the app is your Stellar USDC (not Base USDC). Make sure you have the USDC trustline established on your Stellar account.`,
    keywords: ['balance', 'reserve', 'xlm', 'minimum', 'trustline', 'insufficient', 'xlm reserve'],
  },

  // ── 3. SENDING MONEY ───────────────────────────────────────────────────────
  {
    id: 'how-to-send',
    category: 'sending',
    title: 'How to Send an Off-Ramp Transfer',
    content: `Step-by-step guide to converting USDC to fiat:

Step 1 — Enter Amount
• Type the USDC amount, or switch the input mode to enter the fiat amount instead
• The estimated payout updates in real time as you type

Step 2 — Select Currency & Bank
• Choose your destination fiat currency (NGN, KES, GHS, …)
• Select the bank or financial institution from the list
• Enter the beneficiary account number; it will be verified automatically

Step 3 — Choose Gas Fee Method
• XLM: Network fee deducted from your XLM balance
• USDC: Network fee deducted from your USDC balance

Step 4 — Review & Confirm
• Check the rate, fees, and final payout amount
• Click "Send" and sign the transaction in your wallet
• Do not close the browser while the transaction is in progress

Step 5 — Wait for Settlement
• Typical time: 5–15 minutes
• Track progress in the status bar or visit /history`,
    keywords: [
      'send',
      'transfer',
      'convert',
      'offramp',
      'off-ramp',
      'fiat',
      'bank',
      'step by step',
      'how to send',
    ],
  },
  {
    id: 'dual-input-mode',
    category: 'sending',
    title: 'Crypto Amount vs Fiat Amount Input',
    content: `You can enter either the crypto (USDC) amount or the fiat amount.

Switching modes:
• Click the toggle icon next to the amount field to switch between USDC and fiat input
• When entering in fiat, the app calculates the required USDC amount including fees

Dual input is useful when:
• You need an exact fiat payout (e.g., paying an exact bill)
• You want to send your full USDC balance (enter in USDC mode)

Note: The displayed fiat amount is an estimate based on the live rate. Final settlement may vary by ±0.5% due to rate fluctuations during bridge confirmation.`,
    keywords: [
      'dual input',
      'fiat amount',
      'crypto amount',
      'switch',
      'toggle',
      'usdc input',
      'fiat input',
    ],
  },

  // ── 4. FEES ────────────────────────────────────────────────────────────────
  {
    id: 'fees',
    category: 'fees',
    title: 'Transaction Fees Explained',
    content: `Stellar-Spend charges transparent, itemised fees:

Bridge Fee: ~0.3%–0.5% of the transfer amount
• Paid to Allbridge for cross-chain conversion (Stellar → Base)

Platform Fee: 0.35% of the transfer amount
• Covers operational costs and compliance

Network Fee: Fixed ~2.50 USDC equivalent
• Covers Stellar and Base gas costs
• Can be paid in XLM or USDC (your choice)

Paycrest Payout Fee: 0% (no additional fee)
• Paycrest does not charge extra for fiat settlement

Total fees are shown on the quote screen before you confirm. The "You receive" amount is the final fiat payout after all deductions.

FAQ — Why does my payout differ from the displayed amount?
Minor rate changes during bridge processing (< 1 minute) may cause small differences. Rates are locked at bridge submission, not at quote time.`,
    keywords: [
      'fee',
      'cost',
      'charge',
      'gas',
      'bridge fee',
      'platform fee',
      'network fee',
      '0.35',
      'how much',
      'price',
    ],
  },
  {
    id: 'gas-fee-options',
    category: 'fees',
    title: 'Choosing Your Gas Fee Method',
    content: `You can pay the Stellar/Base network fee in XLM or USDC.

XLM method:
• Gas deducted from your XLM balance on Stellar
• Your USDC amount is fully used for the transfer
• Requires sufficient XLM above the minimum reserve

USDC method:
• Gas deducted from your USDC transfer amount
• Net USDC bridged is slightly less
• Useful when XLM is low

Recommendation: Use USDC fee if your XLM balance is near the minimum reserve.`,
    keywords: ['gas fee', 'xlm fee', 'usdc fee', 'fee method', 'gas payment', 'stablecoin fee'],
  },

  // ── 5. CURRENCIES & BANKS ──────────────────────────────────────────────────
  {
    id: 'supported-currencies',
    category: 'currencies',
    title: 'Supported Currencies & Countries',
    content: `Stellar-Spend currently supports the following fiat currencies:

• NGN — Nigerian Naira (Nigeria)
• KES — Kenyan Shilling (Kenya)
• GHS — Ghanaian Cedi (Ghana)
• ZAR — South African Rand (South Africa)
• Additional corridors are added regularly

Each currency supports specific banks and mobile money operators. Select your currency to see the available institutions.

To request a new corridor, open an issue on the project repository or contact support.`,
    keywords: [
      'currency',
      'country',
      'fiat',
      'ngn',
      'kes',
      'ghs',
      'zar',
      'nigeria',
      'kenya',
      'ghana',
      'south africa',
      'corridor',
    ],
  },
  {
    id: 'bank-verification',
    category: 'currencies',
    title: 'Bank Account Verification',
    content: `When you enter a bank account number, Stellar-Spend verifies it in real time.

How verification works:
1. You select the bank and enter the account number
2. The app calls the Paycrest verification API
3. The account holder's name is returned and displayed
4. Confirm the name matches your intended recipient before proceeding

Common verification errors:
• "Account not found" — check the account number and selected bank
• "Verification unavailable" — retry; this is usually a temporary API issue
• Name mismatch — verify you selected the correct bank and entered the right number

Important: Always confirm the displayed account name before sending funds. Transactions to the wrong account cannot be reversed once the bridge has settled.`,
    keywords: ['bank', 'verification', 'account number', 'account name', 'verify', 'beneficiary'],
  },

  // ── 6. STATUS & TRACKING ───────────────────────────────────────────────────
  {
    id: 'transaction-status',
    category: 'tracking',
    title: 'Tracking Your Transaction',
    content: `After initiating a transfer, you can track progress in real time.

Status stages:
1. Pending — Waiting for Stellar network confirmation (30–60 seconds)
2. Bridging — Allbridge converting USDC from Stellar to Base (1–5 minutes)
3. Settling — Server creating Paycrest payout order
4. Processing — Paycrest converting USDC to fiat and initiating bank transfer
5. Complete — Funds sent to beneficiary's bank account

Where to track:
• Live status bar shown on the main page during the transaction
• /history page — full transaction history with status badges
• Email / push notification (if notifications are enabled)

If status is stuck for more than 30 minutes, see the Troubleshooting section or contact support.`,
    keywords: [
      'status',
      'track',
      'progress',
      'pending',
      'bridging',
      'settling',
      'processing',
      'complete',
      'history',
    ],
  },
  {
    id: 'transaction-history',
    category: 'tracking',
    title: 'Transaction History',
    content: `Your full transaction history is available at /history.

Features:
• Filter by date range, currency, status, or amount
• Export to CSV, PDF, or JSON for accounting
• View transaction receipts with exchange rate details
• Copy transaction hash to verify on Stellar Explorer or Base Scan
• File a dispute for transactions with issues

Transaction data is stored locally in your browser (localStorage) and optionally synced to the server if you enable account sync.

Note: Clearing browser data or switching devices will remove locally stored history unless sync is enabled.`,
    keywords: ['history', 'transactions', 'past', 'export', 'receipt', 'filter', 'records'],
  },

  // ── 7. REFUNDS & FAILURES ──────────────────────────────────────────────────
  {
    id: 'refunds',
    category: 'refunds',
    title: 'Refunds & Failed Transactions',
    content: `What happens when a transaction fails?

If the bridge fails (before Base confirmation):
• Your Stellar USDC is automatically refunded to your wallet
• Refund typically arrives within 30 minutes
• Check /history for the refund entry

If the Paycrest payout fails (after bridge):
• The USDC held on Base is returned to the refund address
• Contact support with your transaction hash for manual resolution

Refund eligibility:
• Transactions qualify for refund within 24 hours of initiation
• Bridge fees may not be refundable if the bridge partially completed

To request a refund manually:
1. Go to /history
2. Click the transaction
3. Click "Request Refund" if eligible
4. Provide the reason and submit`,
    keywords: ['refund', 'failed', 'failure', 'error', 'money back', 'return', 'stuck', 'reversed'],
  },
  {
    id: 'faq-timing',
    category: 'refunds',
    title: 'FAQ: Why Is My Transfer Taking So Long?',
    content: `Typical transfer time is 5–15 minutes. Here's what can cause delays:

Stellar network congestion:
• High transaction volume may slow bridge confirmation
• Usually resolves within 15 minutes

Allbridge bridge processing:
• The bridge waits for multiple confirmations on both chains
• Peak hours may add 5–10 minutes

Paycrest bank processing:
• Bank transfers depend on your bank's clearing schedule
• Weekend and holiday transfers may take until the next business day
• Mobile money (M-Pesa, etc.) typically settles faster

If your transfer is stuck for more than 30 minutes at "Bridging":
• Check the Allbridge status page
• Check Stellar.Expert for the transaction hash
• Contact support if the transaction is not visible on-chain`,
    keywords: [
      'slow',
      'delay',
      'time',
      'how long',
      '30 minutes',
      'stuck',
      'congestion',
      'weekend',
      'timing',
    ],
  },

  // ── 8. SECURITY ────────────────────────────────────────────────────────────
  {
    id: 'security',
    category: 'security',
    title: 'Security & Safety',
    content: `Stellar-Spend is designed with security as a priority.

How we protect you:
• Non-custodial — your private keys never leave your wallet
• All transactions are signed in your local wallet extension
• HTTPS-only communication
• Server never stores private keys or seed phrases
• Regular third-party security audits
• HMAC-verified webhooks to prevent spoofing

What you should do:
• Never share your private keys or seed phrase with anyone
• Verify the URL is stellar-spend.io before connecting your wallet
• Only install wallet extensions from official sources (freighter.app, lobstr.co)
• Enable 2FA in Settings → Security if available

We will NEVER ask for your seed phrase or private key.`,
    keywords: [
      'security',
      'safe',
      'private key',
      'seed phrase',
      'protection',
      '2fa',
      'non-custodial',
      'audit',
    ],
  },

  // ── 9. FAQs ────────────────────────────────────────────────────────────────
  {
    id: 'faq-fees-deducted',
    category: 'faq',
    title: 'FAQ: Where Are Fees Deducted From?',
    content: `All fees are deducted from the USDC amount you send (or from XLM if you choose the XLM gas fee option).

Example for a 100 USDC transfer to NGN:
• Bridge fee (0.4%): ~0.40 USDC
• Platform fee (0.35%): ~0.35 USDC
• Network fee: ~2.50 USDC equivalent
• Net USDC reaching Paycrest: ~96.75 USDC
• Final NGN payout: 96.75 × current USDC/NGN rate

You always see the full breakdown before confirming.`,
    keywords: ['fee deducted', 'where fees', 'fee breakdown', 'total fee', 'net amount', 'example'],
  },
  {
    id: 'faq-minimum',
    category: 'faq',
    title: 'FAQ: What Is the Minimum Transfer Amount?',
    content: `The minimum transfer amount is 0.70 USDC.

This minimum exists because:
• Fixed network fees (~2.50 USDC) would exceed the transfer amount for very small sends
• The Paycrest payout system has minimum order sizes per currency

For most corridors, sending less than $5 USDC will result in a very small fiat payout after fees. We recommend transfers of at least $10 USDC for meaningful payouts.`,
    keywords: ['minimum', 'minimum amount', '0.70', 'small amount', 'min'],
  },
  {
    id: 'faq-kyc',
    category: 'faq',
    title: 'FAQ: Do I Need KYC?',
    content: `Stellar-Spend has tiered KYC requirements.

Tier 0 (no KYC):
• Transfers up to $150 USDC per transaction
• Suitable for small personal transfers

Tier 1 (basic KYC):
• Transfers up to $500 USDC per transaction
• Requires name and phone number verification

Tier 2 (full KYC):
• Transfers above $500 USDC
• Requires government-issued ID

KYC is handled in Settings → KYC & Limits. Verification is fast (usually < 5 minutes).`,
    keywords: ['kyc', 'identity', 'verification', 'limit', 'tier', 'know your customer'],
  },

  // ── 10. TROUBLESHOOTING ────────────────────────────────────────────────────
  {
    id: 'troubleshooting',
    category: 'troubleshooting',
    title: 'Troubleshooting Common Issues',
    content: `Quick fixes for the most common problems:

Wallet won't connect:
→ Ensure the extension is installed and enabled
→ Switch to Mainnet in wallet settings
→ Refresh the page and try again

"Invalid environment configuration" on load:
→ The app is misconfigured; contact the operator

"Bridge quote unavailable":
→ Temporary Allbridge outage — retry in 30 seconds
→ Check https://allbridge.io/status

"FX rate unavailable":
→ Paycrest rate API is temporarily down — retry shortly

"Simulation failed: resulting balance not within allowed range":
→ Your USDC balance is below the transfer amount + fees
→ Reduce the transfer amount or add more USDC

Transaction shows "Complete" but bank not credited:
→ Bank processing can take up to 1 business day
→ Check if the account details were correct
→ Contact support with your transaction hash

For further help: support@stellar-spend.io`,
    keywords: [
      'troubleshoot',
      'fix',
      'error',
      'problem',
      'issue',
      'not working',
      'support',
      'help',
      'contact',
    ],
  },
];

/** All unique topic categories in display order */
export const HELP_CATEGORIES: { id: string; label: string }[] = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'sending', label: 'Sending Money' },
  { id: 'fees', label: 'Fees' },
  { id: 'currencies', label: 'Currencies & Banks' },
  { id: 'tracking', label: 'Status & Tracking' },
  { id: 'refunds', label: 'Refunds & Failures' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQs' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
];
