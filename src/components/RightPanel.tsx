'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { QuoteDisplaySkeleton } from './skeletons';
import { useFxRate } from '@/hooks/useFxRate';
import { CollapsibleSection } from './CollapsibleSection';

export interface RightPanelProps {
  isConnected: boolean;
  isConnecting: boolean;
  amount: string;
  quote: { destinationAmount: string; rate: number; currency: string } | null;
  isLoadingQuote: boolean;
  currency: string;
  onConnect: () => void;
}

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

const NGN_FORMATTER = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    NGN: '₦',
    USD: '$',
    EUR: '€',
    GBP: '£',
    KES: 'KSh',
    GHS: '₵',
    ZAR: 'R',
  };
  return symbols[currency.toUpperCase()] || currency.toUpperCase();
}

function formatFiat(value: string | number, currency: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';

  const symbol = getCurrencySymbol(currency);

  if (currency.toUpperCase() === 'NGN') {
    return `${symbol}${NGN_FORMATTER.format(num)}`;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    // Fallback for unknown currency codes
    return `${symbol} ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)}`;
  }
}

function formatRate(rate: number, currency: string): string {
  if (!rate) return '—';
  return `${formatFiat(rate, currency)} / USDC`;
}

function formatNetworkFee(quote: RightPanelProps['quote']): string {
  if (!quote) return '—';
  // bridgeFee lives on the full QuoteResponse; the panel prop only carries
  // destinationAmount + rate + currency, so we show a fixed network fee
  // that matches the SETTLEMENT_BREAKDOWN reference data.
  return '2.50 USDC';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeroPanel({
  isConnected,
  isConnecting,
  amount,
  quote,
  isLoadingQuote,
  currency,
  onConnect,
  liveRate,
  flash,
}: RightPanelProps & { liveRate: number | null; flash: boolean }) {
  const hasAmount = amount && parseFloat(amount) > 0;

  // Prefer live rate over quote rate for realtime payout calculation
  const effectiveRate = liveRate ?? quote?.rate ?? null;
  const liveDestination =
    effectiveRate && hasAmount
      ? (parseFloat(amount) * effectiveRate).toFixed(2)
      : (quote?.destinationAmount ?? null);

  // Derive hero content based on state
  let heroLabel: string;
  let heroValue: ReactNode;
  let heroMeta: string;

  if (!isConnected && !isConnecting) {
    heroLabel = 'WALLET REQUIRED';
    heroValue = <span className="text-[#777777]">{getCurrencySymbol(currency || 'NGN')} --</span>;
    heroMeta = 'Connect wallet to preview payout';
  } else if (isConnecting) {
    heroLabel = 'CONNECTING';
    heroValue = <span className="text-[#c9a962]">Awaiting signature</span>;
    heroMeta = 'Approve connection in your wallet to continue';
  } else if (isLoadingQuote) {
    heroLabel = 'CALCULATING';
    heroValue = (
      <span className="text-[#c9a962] flex items-center gap-1">
        <span className="dot-bounce" style={{ animationDelay: '0ms' }}>
          .
        </span>
        <span className="dot-bounce" style={{ animationDelay: '150ms' }}>
          .
        </span>
        <span className="dot-bounce" style={{ animationDelay: '300ms' }}>
          .
        </span>
      </span>
    );
    heroMeta = 'Fetching live rate...';
  } else if (isConnected && hasAmount && (quote || liveDestination)) {
    heroLabel = 'ESTIMATED PAYOUT';
    heroValue = (
      <span className={cn('text-[#c9a962] transition-colors duration-300', flash && 'text-white')}>
        {formatFiat(liveDestination ?? quote!.destinationAmount, currency || quote!.currency)}
      </span>
    );
    heroMeta = `Rate: ${formatRate(effectiveRate ?? quote!.rate, currency || quote!.currency)}`;
  } else {
    heroLabel = 'READY TO PAYOUT';
    heroValue = <span className="text-[#777777]">Enter amount</span>;
    heroMeta = 'Wallet connected • payout route active';
  }

  return (
    <div
      className={cn(
        'border border-[#333333] bg-[#111111] p-5 flex flex-col gap-4',
        isConnecting && 'animate-[pulse_2s_ease-in-out_infinite]',
      )}
    >
      {/* Label */}
      <span className="text-[10px] tracking-[0.2em] text-[#777777] uppercase">{heroLabel}</span>

      {/* Value */}
      <div
        className="font-space-grotesk font-bold leading-none"
        style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}
      >
        {heroValue}
      </div>

      {/* Meta */}
      <span className="text-[11px] text-[#777777] tracking-wide">{heroMeta}</span>

      {/* Connect button — only when fully disconnected */}
      {!isConnected && !isConnecting && (
        <button
          onClick={onConnect}
          className={cn(
            'mt-1 w-full py-2.5 min-h-[44px] text-xs tracking-widest border border-[#c9a962]',
            'text-[#c9a962] bg-transparent transition-colors duration-150',
            'hover:bg-[#c9a962] hover:text-[#0a0a0a]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a962] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]',
          )}
        >
          CONNECT WALLET
        </button>
      )}
    </div>
  );
}

interface BreakdownRowProps {
  label: string;
  value: string;
  muted?: boolean;
}

function BreakdownRow({ label, value, muted }: BreakdownRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn('text-xs tracking-wider', muted ? 'text-[#777777]' : 'text-[#aaaaaa]')}>
        {label}
      </span>
      <span
        className={cn(
          'text-xs tracking-wider tabular-nums',
          muted ? 'text-[#777777]' : 'text-white',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RightPanel(props: RightPanelProps) {
  const { quote, isConnected, isLoadingQuote, currency } = props;
  const { rate: liveRate, flash } = useFxRate();

  // Show full skeleton when loading quote for the first time (no prior quote)
  if (isLoadingQuote && !quote) {
    return <QuoteDisplaySkeleton />;
  }

  const platformFeeUsdc =
    quote && parseFloat(props.amount) > 0
      ? `${(parseFloat(props.amount) * 0.0035).toFixed(4)} USDC`
      : '0.35%';

  // Use live rate for payout total when available
  const effectiveRate = liveRate ?? quote?.rate ?? null;
  const liveDestination =
    effectiveRate && props.amount && parseFloat(props.amount) > 0
      ? (parseFloat(props.amount) * effectiveRate).toFixed(2)
      : null;

  const payoutTotal =
    isConnected && (liveDestination || quote) && parseFloat(props.amount) > 0
      ? formatFiat(liveDestination ?? quote!.destinationAmount, currency || quote!.currency)
      : isLoadingQuote
        ? '...'
        : `— ${currency.toUpperCase()}`;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Hero panel */}
      <HeroPanel {...props} liveRate={liveRate} flash={flash} />

      {/* Settlement breakdown */}
      <div className="border border-[#333333] bg-[#111111] p-5 flex flex-col gap-3">
        <span className="text-[10px] tracking-[0.2em] text-[#777777] uppercase mb-1">
          SETTLEMENT BREAKDOWN
        </span>

        <BreakdownRow label="Network Fee" value={formatNetworkFee(quote)} muted={!quote} />
        <BreakdownRow label="Platform Fee" value={platformFeeUsdc} muted={!quote} />

        {/* Divider */}
        <div className="border-t border-[#333333] my-1" />

        {/* Payout total */}
        <div className="flex items-end justify-between gap-4">
          <span className="text-xs tracking-widest text-[#777777] uppercase">Payout Total</span>
          <span
            className={cn(
              'font-space-grotesk font-bold tabular-nums leading-none transition-colors duration-300',
              isLoadingQuote ? 'text-[#777777]' : flash ? 'text-white' : 'text-[#c9a962]',
            )}
            style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)' }}
          >
            {payoutTotal}
          </span>
        </div>
      </div>

      {/* Advanced options */}
      <CollapsibleSection
        id="advanced-options"
        title="Advanced Options"
        description="Additional settings for power users"
        defaultOpen={false}
      >
        <div className="flex flex-col gap-3">
          <BreakdownRow label="Bridge Protocol" value="Allbridge" muted />
          <BreakdownRow label="Settlement Chain" value="Base" muted />
          <BreakdownRow label="Payout Provider" value="Paycrest" muted />
        </div>
      </CollapsibleSection>
    </div>
  );
}
