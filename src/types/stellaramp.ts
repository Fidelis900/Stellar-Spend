export type WalletFlowState = 'pre_connect' | 'connecting' | 'connected';

export interface RecentOfframpRow {
  readonly txHash: string;
  readonly usdc: string;
  readonly fiat: string;
  readonly currency: string;
  readonly status: 'SETTLING' | 'COMPLETE';
}

export interface ProgressStep {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly description: string;
}

export interface StateVariant {
  readonly key: WalletFlowState;
  readonly subtitle: string;
  readonly chipText: string;
  readonly formTitle: string;
  readonly formDescription: string;
  readonly walletStatus: string;
  readonly walletStatusTone: 'muted' | 'accent';
  readonly cta: string;
  readonly ctaTone: 'accent' | 'disabled' | 'light';
  readonly heroLabel: string;
  readonly heroValue: string;
  readonly heroMeta: string;
  readonly stepTwoTitle: string;
  readonly stepTwoDescription: string;
  readonly stepOneTitle: string;
  readonly stepOneDescription: string;
  readonly pulse?: boolean;
}

export type OfframpStep =
  | 'idle'
  | 'initiating'
  | 'awaiting-signature'
  | 'submitting'
  | 'processing'
  | 'settling'
  | 'success'
  | 'error';
