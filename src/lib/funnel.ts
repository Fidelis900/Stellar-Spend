/**
 * Conversion funnel tracking (#399)
 *
 * Defines the ordered steps of the offramp funnel and utilities for
 * computing per-step counts, drop-off rates, and conversion rates.
 */

export const FUNNEL_STEPS = [
  'wallet_connect',
  'form_fill',
  'quote_received',
  'signature_requested',
  'tx_submitted',
  'bridge_processing',
  'payout_settling',
  'completed',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelStepData {
  step: FunnelStep;
  label: string;
  count: number;
  /** Percentage of users who reached this step relative to the first step */
  conversionRate: number;
  /** Percentage of users who dropped off between the previous step and this one */
  dropOffRate: number;
}

export interface FunnelData {
  steps: FunnelStepData[];
  /** Overall conversion: completed / wallet_connect */
  overallConversionRate: number;
  totalSessions: number;
}

const STEP_LABELS: Record<FunnelStep, string> = {
  wallet_connect: 'Wallet Connected',
  form_fill: 'Form Filled',
  quote_received: 'Quote Received',
  signature_requested: 'Signature Requested',
  tx_submitted: 'TX Submitted',
  bridge_processing: 'Bridge Processing',
  payout_settling: 'Payout Settling',
  completed: 'Completed',
};

export function getStepLabel(step: FunnelStep): string {
  return STEP_LABELS[step];
}

/**
 * Build FunnelData from a map of step → count.
 * Missing steps default to 0.
 */
export function buildFunnelData(counts: Partial<Record<FunnelStep, number>>): FunnelData {
  const firstCount = counts[FUNNEL_STEPS[0]] ?? 0;
  const lastCount = counts[FUNNEL_STEPS[FUNNEL_STEPS.length - 1]] ?? 0;

  const steps: FunnelStepData[] = FUNNEL_STEPS.map((step, i) => {
    const count = counts[step] ?? 0;
    const prevCount = i === 0 ? count : (counts[FUNNEL_STEPS[i - 1]] ?? 0);
    return {
      step,
      label: STEP_LABELS[step],
      count,
      conversionRate: firstCount > 0 ? (count / firstCount) * 100 : 0,
      dropOffRate: prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 0,
    };
  });

  return {
    steps,
    overallConversionRate: firstCount > 0 ? (lastCount / firstCount) * 100 : 0,
    totalSessions: firstCount,
  };
}
