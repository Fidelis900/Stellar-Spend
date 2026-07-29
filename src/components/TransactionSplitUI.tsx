import { logger } from '@/lib/logger';
('use client');

import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  type SplitRecipient,
  type SplitTransaction,
  computeSplitAmounts,
  validateSplit,
  SplitStorage,
  calculateSplitFees,
} from '@/lib/transaction-split';

interface Props {
  totalAmount: string;
  currency: string;
  onConfirm: (split: SplitTransaction) => void;
  onCancel: () => void;
}

type Tab = 'split' | 'history';

const TEMPLATES: { name: string; recipients: Omit<SplitRecipient, 'id'>[] }[] = [
  {
    name: '50/50',
    recipients: [
      { label: 'Recipient 1', percentage: 50 },
      { label: 'Recipient 2', percentage: 50 },
    ],
  },
  {
    name: '60/40',
    recipients: [
      { label: 'Recipient 1', percentage: 60 },
      { label: 'Recipient 2', percentage: 40 },
    ],
  },
  {
    name: '33/33/34',
    recipients: [
      { label: 'Recipient 1', percentage: 33 },
      { label: 'Recipient 2', percentage: 33 },
      { label: 'Recipient 3', percentage: 34 },
    ],
  },
  {
    name: '25×4',
    recipients: [
      { label: 'Recipient 1', percentage: 25 },
      { label: 'Recipient 2', percentage: 25 },
      { label: 'Recipient 3', percentage: 25 },
      { label: 'Recipient 4', percentage: 25 },
    ],
  },
];

let idCounter = 1;
function makeId() {
  return `r${idCounter++}`;
}

function buildRecipients(defs: Omit<SplitRecipient, 'id'>[]): SplitRecipient[] {
  return defs.map((d) => ({ ...d, id: makeId() }));
}

export default function TransactionSplitUI({ totalAmount, currency, onConfirm, onCancel }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('split');
  const [recipients, setRecipients] = useState<SplitRecipient[]>([
    { id: makeId(), label: 'Recipient 1', percentage: 50 },
    { id: makeId(), label: 'Recipient 2', percentage: 50 },
  ]);

  const [status, setStatus] = useState<Record<string, 'pending' | 'success' | 'failed'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const total = recipients.reduce((s, r) => s + r.percentage, 0);
  const validationError = validateSplit(recipients);
  const preview = computeSplitAmounts(totalAmount, recipients);
  const fees = calculateSplitFees(totalAmount, recipients.length);
  const history = SplitStorage.getAll();

  const update = (id: string, field: keyof SplitRecipient, value: string | number) =>
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const addRecipient = () =>
    setRecipients((prev) => [
      ...prev,
      { id: makeId(), label: `Recipient ${prev.length + 1}`, percentage: 0 },
    ]);

  const removeRecipient = (id: string) => setRecipients((prev) => prev.filter((r) => r.id !== id));

  const equalSplit = () => {
    const pct = parseFloat((100 / recipients.length).toFixed(2));
    const remainder = parseFloat((100 - pct * (recipients.length - 1)).toFixed(2));
    setRecipients((prev) =>
      prev.map((r, i) => ({
        ...r,
        percentage: i === prev.length - 1 ? remainder : pct,
      })),
    );
  };

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setRecipients(buildRecipients(tpl.recipients));
  };

  const handleConfirm = async () => {
    if (validationError) return;

    const split: SplitTransaction = {
      id: SplitStorage.generateId(),
      createdAt: Date.now(),
      totalAmount,
      currency,
      recipients: preview,
      status: 'pending',
      results: {},
    };

    // Initialize results
    const initialResults: SplitTransaction['results'] = {};
    recipients.forEach((r) => {
      initialResults[r.id] = { status: 'pending' };
    });
    split.results = initialResults;

    try {
      // In a real app, we'd send each payout and track status
      // Simulating partial failures for demo
      for (const recipient of preview) {
        try {
          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 800));

          if (Math.random() > 0.8) throw new Error('Network timeout');

          split.results[recipient.id] = { status: 'completed' };
          setStatus((prev) => ({ ...prev, [recipient.id]: 'success' }));
        } catch (err: any) {
          split.results[recipient.id] = {
            status: 'failed',
            error: err.message,
          };
          setStatus((prev) => ({ ...prev, [recipient.id]: 'failed' }));
          setErrors((prev) => ({ ...prev, [recipient.id]: err.message }));
        }
      }

      const completedCount = Object.values(split.results).filter(
        (r) => r.status === 'completed',
      ).length;
      if (completedCount === preview.length) {
        split.status = 'completed';
      } else if (completedCount > 0) {
        split.status = 'partial';
      } else {
        split.status = 'failed';
      }

      SplitStorage.save(split);
      onConfirm(split);
    } catch (err) {
      logger.error('Split execution failed:', {}, err);
    }
  };

  const statusColor = (s: string) =>
    s === 'completed' ? 'text-green-400' : s === 'failed' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="border border-[#333333] bg-[#111111] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white tracking-wider uppercase">
          Split Transaction
        </h2>
        <span className="text-xs text-[#777777]">{totalAmount} USDC</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#222222]">
        {(['split', 'history'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest transition-colors ${
              activeTab === tab
                ? 'text-[#c9a962] border-b border-[#c9a962] -mb-px'
                : 'text-[#555555] hover:text-[#777777]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'split' && (
        <>
          {/* Templates */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-[#777777] uppercase tracking-widest">Templates</div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-[#333333] text-[#777777] hover:border-[#c9a962] hover:text-[#c9a962] transition-colors"
                >
                  {tpl.name}
                </button>
              ))}
              <button
                onClick={equalSplit}
                className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-[#333333] text-[#777777] hover:border-[#c9a962] hover:text-[#c9a962] transition-colors"
              >
                Equal Split
              </button>
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            {recipients.map((r) => {
              const p = preview.find((x) => x.id === r.id);
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <input
                    value={r.label}
                    onChange={(e) => update(r.id, 'label', e.target.value)}
                    placeholder="Label"
                    aria-label={`Label for ${r.label}`}
                    className="flex-1 bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={r.percentage}
                    onChange={(e) => update(r.id, 'percentage', parseFloat(e.target.value) || 0)}
                    aria-label={`Percentage for ${r.label}`}
                    className="w-20 bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white text-right focus:outline-none focus:border-[#c9a962]"
                  />
                  <span className="text-xs text-[#777777] w-4">%</span>
                  <span className="text-xs text-[#aaaaaa] w-24 text-right tabular-nums">
                    {p?.amount ?? '—'} USDC
                  </span>
                  {recipients.length > 2 && (
                    <button
                      onClick={() => removeRecipient(r.id)}
                      className="text-[#555555] hover:text-red-400 text-xs px-1"
                      aria-label={`Remove ${r.label}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total indicator */}
          <div
            className={cn(
              'text-xs text-right',
              Math.abs(total - 100) < 0.01 ? 'text-green-400' : 'text-yellow-400',
            )}
          >
            Total: {total.toFixed(2)}%
          </div>

          {validationError && (
            <p role="alert" className="text-xs text-red-400">
              {validationError}
            </p>
          )}

          {/* Fee Breakdown */}
          <div className="border border-[#222222] p-3 space-y-1.5">
            <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-2">
              Fee Breakdown
            </div>
            <div className="flex justify-between text-xs text-[#aaaaaa]">
              <span>Base fee</span>
              <span className="tabular-nums">{fees.baseFee.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-xs text-[#aaaaaa]">
              <span>Per-recipient fee ({recipients.length} × 0.10)</span>
              <span className="tabular-nums">{fees.perRecipientFee.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-xs text-white font-semibold border-t border-[#222222] pt-1.5">
              <span>Total fee</span>
              <span className="tabular-nums">{fees.totalFee.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-xs text-green-400">
              <span>Net amount</span>
              <span className="tabular-nums">{fees.netAmount.toFixed(2)} USDC</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={addRecipient}
              className="text-[10px] tracking-widest uppercase px-3 py-2 border border-[#333333] text-[#777777] hover:border-[#c9a962] hover:text-[#c9a962] transition-colors"
            >
              + Add Recipient
            </button>
            <div className="ml-auto flex gap-2">
              <button
                onClick={onCancel}
                className="text-[10px] tracking-widest uppercase px-4 py-2 border border-[#333333] text-[#777777] hover:border-[#555555] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!!validationError}
                className={cn(
                  'text-[10px] tracking-widest uppercase px-4 py-2 border',
                  validationError
                    ? 'border-[#333333] text-[#444444] cursor-not-allowed'
                    : 'border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors',
                )}
              >
                Confirm Split
              </button>
            </div>
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <div className="text-xs text-[#555555] text-center py-4">No split history yet</div>
          ) : (
            history.map((s) => (
              <div key={s.id} className="border border-[#222222] p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white font-semibold tabular-nums">
                    {s.totalAmount} USDC
                  </span>
                  <span className={`text-[10px] uppercase font-semibold ${statusColor(s.status)}`}>
                    {s.status}
                  </span>
                </div>
                <div className="text-[10px] text-[#555555]">
                  {new Date(s.createdAt).toLocaleDateString()} · {s.recipients.length} recipients
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.recipients.map((r) => (
                    <span
                      key={r.id}
                      className="text-[10px] text-[#777777] border border-[#222222] px-2 py-0.5"
                    >
                      {r.label}: {r.percentage}% ({r.amount} USDC)
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
