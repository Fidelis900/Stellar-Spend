'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  type RecurringFrequency,
  type RecurringSchedule,
  RecurringStorage,
  computeNextRunAt,
} from '@/lib/recurring-transactions';

interface Props {
  userAddress: string;
}

const FREQ_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

function formatDate(ts: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ts));
}

export default function RecurringScheduleUI({ userAddress }: Props) {
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: '',
    amount: '',
    currency: 'NGN',
    frequency: 'weekly' as RecurringFrequency,
    institution: '',
    accountIdentifier: '',
    accountName: '',
    maxExecutions: '',
  });

  useEffect(() => {
    setSchedules(RecurringStorage.getByUser(userAddress));
  }, [userAddress]);

  const setField = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleCreate = () => {
    if (!form.label || !form.amount || !form.institution || !form.accountIdentifier) return;
    const schedule: RecurringSchedule = {
      id: RecurringStorage.generateId(),
      createdAt: Date.now(),
      userAddress,
      label: form.label,
      amount: form.amount,
      currency: form.currency,
      frequency: form.frequency,
      beneficiary: {
        institution: form.institution,
        accountIdentifier: form.accountIdentifier,
        accountName: form.accountName,
        currency: form.currency,
      },
      nextRunAt: computeNextRunAt(Date.now(), form.frequency),
      paused: false,
      executionCount: 0,
      maxExecutions: form.maxExecutions ? parseInt(form.maxExecutions) : undefined,
    };
    RecurringStorage.save(schedule);
    setSchedules(RecurringStorage.getByUser(userAddress));
    setShowForm(false);
    setForm({
      label: '',
      amount: '',
      currency: 'NGN',
      frequency: 'weekly',
      institution: '',
      accountIdentifier: '',
      accountName: '',
      maxExecutions: '',
    });
  };

  const togglePause = (s: RecurringSchedule) => {
    if (s.paused) RecurringStorage.resume(s.id);
    else RecurringStorage.pause(s.id);
    setSchedules(RecurringStorage.getByUser(userAddress));
  };

  const handleDelete = (id: string) => {
    RecurringStorage.delete(id);
    setSchedules(RecurringStorage.getByUser(userAddress));
  };

  return (
    <div className="border border-[#333333] bg-[#111111] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white tracking-wider uppercase">
          Recurring Payments
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className={cn(
            'text-[10px] tracking-widest uppercase px-3 py-2 border',
            'border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors duration-150',
          )}
        >
          {showForm ? 'Cancel' : '+ New Schedule'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="border border-[#333333] p-4 space-y-3 bg-[#0a0a0a]">
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'label', label: 'Label', placeholder: 'e.g. Monthly rent' },
              { key: 'amount', label: 'Amount (USDC)', placeholder: '100.00' },
              { key: 'institution', label: 'Bank / Institution', placeholder: 'GTBank' },
              { key: 'accountIdentifier', label: 'Account Number', placeholder: '0123456789' },
              { key: 'accountName', label: 'Account Name', placeholder: 'John Doe' },
              { key: 'maxExecutions', label: 'Max Executions (optional)', placeholder: '∞' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[10px] text-[#777777] uppercase tracking-widest">
                  {label}
                </label>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setField(key as keyof typeof form, e.target.value)}
                  placeholder={placeholder}
                  className={cn(
                    'bg-[#111111] border border-[#333333] px-3 py-2 text-xs text-white',
                    'focus:outline-none focus:border-[#c9a962]',
                  )}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#777777] uppercase tracking-widest">
                Frequency
              </label>
              <select
                value={form.frequency}
                onChange={(e) => setField('frequency', e.target.value)}
                className="bg-[#111111] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#777777] uppercase tracking-widest">
                Currency
              </label>
              <select
                value={form.currency}
                onChange={(e) => setField('currency', e.target.value)}
                className="bg-[#111111] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
              >
                {['NGN', 'KES', 'GHS', 'ZAR', 'USD'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleCreate}
            className={cn(
              'text-[10px] tracking-widest uppercase px-4 py-2 border',
              'border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors duration-150',
            )}
          >
            Create Schedule
          </button>
        </div>
      )}

      {/* Schedule list */}
      {schedules.length === 0 ? (
        <p className="text-xs text-[#555555] text-center py-4">No recurring schedules yet</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className={cn(
                'border p-3 flex items-start justify-between gap-3',
                s.paused ? 'border-[#333333] opacity-60' : 'border-[#444444]',
              )}
            >
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs text-white font-medium truncate">{s.label}</div>
                <div className="text-[10px] text-[#777777]">
                  {s.amount} USDC · {FREQ_LABELS[s.frequency]} · {s.beneficiary.institution}
                </div>
                <div className="text-[10px] text-[#555555]">
                  Next: {formatDate(s.nextRunAt)} · Runs: {s.executionCount}
                  {s.maxExecutions ? `/${s.maxExecutions}` : ''}
                </div>
                {s.lastResult && (
                  <div
                    className={cn(
                      'text-[10px]',
                      s.lastResult.status === 'success' ? 'text-green-400' : 'text-red-400',
                    )}
                  >
                    Last: {s.lastResult.status}
                    {s.lastResult.error ? ` — ${s.lastResult.error}` : ''}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => togglePause(s)}
                  className={cn(
                    'text-[10px] tracking-widest uppercase px-2 py-1 border transition-colors duration-150',
                    s.paused
                      ? 'border-green-500/50 text-green-400 hover:bg-green-500/10'
                      : 'border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10',
                  )}
                  aria-label={s.paused ? 'Resume schedule' : 'Pause schedule'}
                >
                  {s.paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-[10px] tracking-widest uppercase px-2 py-1 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors duration-150"
                  aria-label="Delete schedule"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
