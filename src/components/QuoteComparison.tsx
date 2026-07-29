'use client';

import { useState } from 'react';

export interface ProviderQuote {
  id: string;
  provider: string;
  rate: number;
  bridgeFee: string;
  payoutFee: string;
  totalFee: string;
  estimatedTime: number; // seconds
  destinationAmount: string;
  currency: string;
  rating: number; // 1-5
  badge?: 'Best Rate' | 'Fastest' | 'Lowest Fee';
}

interface QuoteComparisonProps {
  quotes: ProviderQuote[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          style={{
            fontSize: 10,
            color: s <= rating ? 'var(--accent)' : 'var(--line)',
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `~${mins}m`;
}

export function QuoteComparison({ quotes, selectedId, onSelect, isLoading }: QuoteComparisonProps) {
  const [sortBy, setSortBy] = useState<'rate' | 'fee' | 'time'>('rate');

  const sorted = [...quotes].sort((a, b) => {
    if (sortBy === 'rate') return b.rate - a.rate;
    if (sortBy === 'fee') return parseFloat(a.totalFee) - parseFloat(b.totalFee);
    return a.estimatedTime - b.estimatedTime;
  });

  if (isLoading) {
    return (
      <div style={{ padding: '16px 0' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 72, marginBottom: 8, borderRadius: 4 }}
          />
        ))}
      </div>
    );
  }

  if (!quotes.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Sort controls */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sort by:</span>
        {(['rate', 'fee', 'time'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setSortBy(opt)}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              border: '1px solid',
              borderColor: sortBy === opt ? 'var(--accent)' : 'var(--line)',
              color: sortBy === opt ? 'var(--accent)' : 'var(--muted)',
              background: 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {opt === 'rate' ? 'Best Rate' : opt === 'fee' ? 'Lowest Fee' : 'Fastest'}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 80px 70px 60px 32px',
          gap: 8,
          padding: '6px 12px',
          fontSize: 10,
          color: 'var(--muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span>Provider</span>
        <span>You Receive</span>
        <span>Total Fee</span>
        <span>Est. Time</span>
        <span>Rating</span>
        <span />
      </div>

      {/* Rows */}
      {sorted.map((q) => {
        const isSelected = q.id === selectedId;
        return (
          <button
            key={q.id}
            onClick={() => onSelect(q.id)}
            aria-pressed={isSelected}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px 70px 60px 32px',
              gap: 8,
              padding: '10px 12px',
              border: '1px solid',
              borderColor: isSelected ? 'var(--accent)' : 'var(--line)',
              background: isSelected
                ? 'color-mix(in srgb, var(--accent) 8%, var(--panel))'
                : 'var(--panel)',
              cursor: 'pointer',
              textAlign: 'left',
              alignItems: 'center',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {/* Provider name + badge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                {q.provider}
              </span>
              {q.badge && (
                <span
                  style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    background: 'var(--accent)',
                    color: '#000',
                    borderRadius: 2,
                    width: 'fit-content',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {q.badge}
                </span>
              )}
            </div>

            {/* Destination amount */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>
                {parseFloat(q.destinationAmount).toLocaleString()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{q.currency}</span>
            </div>

            {/* Fees breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{q.totalFee} USDC</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                Bridge: {q.bridgeFee} · Payout: {q.payoutFee}
              </span>
            </div>

            {/* Estimated time */}
            <span style={{ fontSize: 13, color: 'var(--text)' }}>
              {formatTime(q.estimatedTime)}
            </span>

            {/* Rating */}
            <StarRating rating={q.rating} />

            {/* Selection indicator */}
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid',
                borderColor: isSelected ? 'var(--accent)' : 'var(--line)',
                background: isSelected ? 'var(--accent)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isSelected && <span style={{ fontSize: 8, color: '#000', lineHeight: 1 }}>✓</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
