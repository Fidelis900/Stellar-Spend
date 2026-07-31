import type {
  ProgressStep,
  RecentOfframpRow,
  StateVariant,
  WalletFlowState,
} from '@shared/types/stellaramp';

export const RECENT_OFFRAMPS: ReadonlyArray<RecentOfframpRow> = [
  { txHash: '5f90...a1c4', usdc: '500.00', fiat: '₦799,000', currency: 'NGN', status: 'SETTLING' },
  { txHash: 'c2d7...9b3f', usdc: '250.00', fiat: '₦398,925', currency: 'NGN', status: 'COMPLETE' },
];

export const SETTLEMENT_BREAKDOWN = [
  { label: 'FX Rate', value: '₦1,598' },
  { label: 'Network Fee', value: '2.50 USDC' },
  { label: 'Platform Fee', value: '0.35%' },
] as const;

export const PAYOUT_TOTAL = '₦1,997,500';

export const STATE_VARIANTS: Readonly<Record<WalletFlowState, StateVariant>> = {
  pre_connect: {
    key: 'pre_connect',
    subtitle: 'Connect your wallet to start your off-ramp.',
    chipText: 'LIVE RATE: ₦1,598 / USDC',
    formTitle: 'CONNECT WALLET',
    formDescription: 'Securely connect a Stellar-compatible wallet before entering payout details.',
    walletStatus: 'Not connected',
    walletStatusTone: 'muted',
    cta: 'CONNECT WALLET',
    ctaTone: 'accent',
    heroLabel: 'WALLET REQUIRED',
    heroValue: '₦ --',
    heroMeta: 'Connect wallet to preview payout',
    stepOneTitle: 'CONNECT WALLET',
    stepOneDescription: 'Authorize Stellar-Spend from your wallet extension.',
    stepTwoTitle: 'FX LOCK',
    stepTwoDescription: 'Rate locked instantly after confirmation.',
  },
  connecting: {
    key: 'connecting',
    subtitle: 'Wallet authorization requested. Complete connection in your wallet.',
    chipText: 'WALLET HANDSHAKE IN PROGRESS',
    formTitle: 'CONNECTING WALLET',
    formDescription: 'Waiting for wallet signature before opening the off-ramp form.',
    walletStatus: 'Request sent to wallet...',
    walletStatusTone: 'accent',
    cta: 'WAITING FOR SIGNATURE...',
    ctaTone: 'disabled',
    heroLabel: 'CONNECTING',
    heroValue: 'Awaiting signature',
    heroMeta: 'Approve connection in your wallet to continue',
    stepOneTitle: 'CONNECT WALLET',
    stepOneDescription: 'Authorize Stellar-Spend from your wallet extension.',
    stepTwoTitle: 'SIGNATURE PENDING',
    stepTwoDescription: 'Request is in-flight. Confirm in wallet to lock rate.',
    pulse: true,
  },
  connected: {
    key: 'connected',
    subtitle: 'Wallet connected. You can now complete your off-ramp.',
    chipText: 'WALLET CONNECTED',
    formTitle: 'READY TO OFFRAMP',
    formDescription: 'Connected wallet detected. Confirm amount and settlement bank details.',
    walletStatus: 'GCFX...2YTK Connected',
    walletStatusTone: 'accent',
    cta: 'INITIATE OFFRAMP →',
    ctaTone: 'light',
    heroLabel: 'READY TO PAYOUT',
    heroValue: '₦1,997,500',
    heroMeta: 'Wallet connected • payout route active',
    stepOneTitle: 'CONNECTED ✓',
    stepOneDescription: 'Connection successful. Proceed with transfer.',
    stepTwoTitle: 'FX LOCK',
    stepTwoDescription: 'Rate locked instantly after confirmation.',
  },
};

export function buildProgressSteps(variant: StateVariant): ReadonlyArray<ProgressStep> {
  return [
    {
      id: 's1',
      number: '01',
      title: variant.stepOneTitle,
      description: variant.stepOneDescription,
    },
    {
      id: 's2',
      number: '02',
      title: variant.stepTwoTitle,
      description: variant.stepTwoDescription,
    },
    {
      id: 's3',
      number: '03',
      title: '₦ PAYOUT',
      description: 'Settlement to your local bank account.',
    },
  ];
}
