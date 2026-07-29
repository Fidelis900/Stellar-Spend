/**
 * ARIA utilities for accessibility (#397 - Text alternatives for non-text content)
 */

export const ariaLabels = {
  // Navigation
  mainNav: 'Main navigation',
  skipToContent: 'Skip to main content',

  // Forms
  amountInput: 'Enter amount in USDC',
  currencySelect: 'Select destination currency',
  bankSelect: 'Select recipient bank',
  accountNumberInput: 'Enter recipient account number',
  accountNameInput: 'Enter recipient account name',
  feeMethodSelect: 'Select fee payment method',

  // Buttons
  connectWallet: 'Connect your Stellar wallet',
  disconnectWallet: 'Disconnect wallet',
  submitTransaction: 'Submit transaction for processing',
  confirmTransaction: 'Confirm and proceed with transaction',
  cancelTransaction: 'Cancel transaction',
  editTransaction: 'Edit transaction details',
  copyToClipboard: 'Copy to clipboard',
  closeModal: 'Close dialog',
  toggleTheme: (current: string, next: string) =>
    `Switch to ${next} mode. Current theme: ${current}`,

  // Status
  loadingIndicator: 'Loading',
  successMessage: 'Operation completed successfully',
  errorMessage: 'An error occurred',
  warningMessage: 'Warning',

  // Modals
  previewModal: 'Transaction preview',
  walletModal: 'Wallet selection',
  shortcutsModal: 'Keyboard shortcuts',

  // Tables
  transactionTable: 'Recent transactions',
  transactionRow: (txHash: string) => `Transaction ${txHash}`,

  // Live regions
  quoteUpdate: 'Exchange rate and quote updated',
  transactionStatus: 'Transaction status updated',
  errorNotification: 'Error notification',

  // Charts and graphs (#397)
  analyticsChart: 'Analytics chart showing transaction data',
  fxRateChart: 'Exchange rate chart',
  transactionVolumeChart: (currency: string, amount: string) =>
    `Transaction volume chart: ${amount} in ${currency}`,
  progressBar: (percent: number, label: string) => `${label}: ${percent}% complete`,
  statusIndicator: (status: string) => `Status: ${status}`,

  // Images (#397)
  walletLogo: (walletName: string) => `${walletName} wallet logo`,
  currencyFlag: (currency: string) => `${currency} currency flag`,
  qrCode: (content: string) => `QR code for ${content}`,
  architectureDiagram:
    'Stellar-Spend architecture diagram showing the transaction flow from user wallet through Allbridge bridge to Paycrest payout',

  // Icons with meaning (#397)
  successIcon: 'Success',
  errorIcon: 'Error',
  warningIcon: 'Warning',
  infoIcon: 'Information',
  externalLinkIcon: 'Opens in new tab',
  copyIcon: 'Copy',
  checkIcon: 'Confirmed',
  spinnerIcon: 'Loading',
};

export const ariaDescriptions = {
  bridgeFee: 'Fee charged by the bridge protocol for cross-chain transfer',
  payoutFee: 'Fee charged by the payout provider for bank settlement',
  estimatedTime: 'Approximate time for the transaction to complete',
  feeMethod: 'Choose to pay fees in XLM (native) or USDC (stablecoin)',
  highContrastMode: 'High contrast mode increases color contrast for better visibility',
  qrCodeScan: 'Scan this QR code with your mobile device to share transaction details',
};

export const ariaLive = {
  polite: 'polite' as const,
  assertive: 'assertive' as const,
};
