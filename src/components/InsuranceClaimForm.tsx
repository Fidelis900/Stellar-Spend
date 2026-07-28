'use client';

import { FormEvent, useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsuranceClaimFormProps {
  transactionId: string;
  insuranceId: string;
  /** Coverage amount for display */
  coverage: number;
  onSuccess: (claimId: string) => void;
  onCancel: () => void;
}

const CLAIM_REASONS = [
  'Transaction failed - funds not delivered',
  'Incorrect amount received',
  'Transaction reversed without refund',
  'Fraudulent or unauthorized transaction',
  'Technical error during processing',
  'Other',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsuranceClaimForm({
  transactionId,
  insuranceId,
  coverage,
  onSuccess,
  onCancel,
}: InsuranceClaimFormProps) {
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  // Simulate eligibility check on mount
  useEffect(() => {
    const check = async () => {
      setIsCheckingEligibility(true);
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 1500));
      // In a real app, we'd call an API. Here we assume transactions with 'ins_' are mocks and always eligible.
      setIsEligible(true);
      setIsCheckingEligibility(false);
    };
    check();
  }, [insuranceId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason || !isEligible) return;

    setError(null);
    setLoading(true);

    try {
      if (insuranceId.startsWith('ins_')) {
        await new Promise((r) => setTimeout(r, 1000));
        onSuccess(`CLAIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
        return;
      }

      const res = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/insurance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insuranceId, reason, evidence: evidence || undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      const claimId = data?.claim?.claim_id ?? data?.claim?.id ?? 'CLAIM-FILED';
      onSuccess(claimId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to file claim');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md border border-[#333333] bg-[#0a0a0a] p-6 flex flex-col gap-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="claim-form-title"
              className="text-sm font-semibold text-white tracking-wider uppercase"
            >
              {t('insurance.claim_title')}
            </h2>
            <p className="text-xs text-[#777777] mt-1">
              {t('insurance.coverage')} up to{' '}
              <span className="text-[#4ade80] font-bold">
                {coverage.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
              </span>
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close claim form"
            className="text-[#777777] hover:text-white transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]"
          >
            ✕
          </button>
        </div>

        {/* Eligibility Check */}
        {isCheckingEligibility ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3 bg-[#111111] border border-[#222222]">
            <div className="w-6 h-6 border-2 border-[#c9a962]/20 border-t-[#c9a962] rounded-full animate-spin" />
            <p className="text-[10px] text-[#777777] uppercase tracking-widest">
              {t('insurance.eligibility_check')}
            </p>
          </div>
        ) : !isEligible ? (
          <div className="p-4 bg-red-900/20 border border-red-500/50 flex flex-col items-center gap-3">
            <span className="text-2xl">⚠</span>
            <p className="text-xs text-red-400 text-center">{t('insurance.ineligible')}</p>
            <button
              onClick={onCancel}
              className="text-[10px] uppercase tracking-widest text-white underline"
            >
              Go Back
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 animate-in fade-in duration-300"
          >
            <div className="p-2 bg-green-900/10 border border-green-500/30 flex items-center gap-2">
              <span className="text-green-500 text-xs">✓</span>
              <p className="text-[10px] text-green-500 uppercase tracking-widest font-bold">
                {t('insurance.eligible')}
              </p>
            </div>

            {/* Reason */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="claim-reason"
                className="text-[10px] tracking-widest uppercase text-[#777777]"
              >
                {t('insurance.claim_reason')} *
              </label>
              <select
                id="claim-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className={cn(
                  'w-full bg-[#111111] border border-[#333333] px-3 py-2.5',
                  'text-xs text-white appearance-none cursor-pointer',
                  'focus:outline-none focus:border-[#c9a962]',
                  'disabled:opacity-50',
                )}
              >
                <option value="">Select a reason...</option>
                {CLAIM_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Evidence */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="claim-evidence"
                className="text-[10px] tracking-widest uppercase text-[#777777]"
              >
                {t('insurance.evidence')}{' '}
                <span className="text-[#555555] normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                id="claim-evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder={t('insurance.evidence_placeholder')}
                rows={3}
                maxLength={2000}
                className={cn(
                  'w-full bg-[#111111] border border-[#333333] px-3 py-2.5 resize-none',
                  'text-xs text-white placeholder-[#555555]',
                  'focus:outline-none focus:border-[#c9a962]',
                )}
              />
            </div>

            {/* Document Upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] tracking-widest uppercase text-[#777777]">
                {t('insurance.upload_document')}
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed border-[#333333] p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#c9a962] transition-colors',
                  filePreview && 'border-[#c9a962] bg-[#c9a962]/5',
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,application/pdf"
                />
                {filePreview ? (
                  <div className="flex flex-col items-center gap-2">
                    {selectedFile?.type.startsWith('image/') ? (
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="h-20 w-auto object-contain border border-[#333333]"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-[#222222] flex items-center justify-center text-xs">
                        PDF
                      </div>
                    )}
                    <span className="text-[10px] text-white truncate max-w-[200px]">
                      {selectedFile?.name}
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="text-xl opacity-30">↑</span>
                    <span className="text-[10px] text-[#555555] uppercase tracking-widest">
                      Click to upload JPG, PNG or PDF (max 5MB)
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
              >
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className={cn(
                  'flex-1 py-2.5 min-h-[44px] text-[10px] font-bold tracking-widest border border-[#333333]',
                  'text-[#777777] bg-transparent transition-colors duration-150',
                  'hover:border-[#555555] hover:text-white',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {t('common.cancel').toUpperCase()}
              </button>
              <button
                type="submit"
                disabled={!reason || loading}
                className={cn(
                  'flex-1 py-2.5 min-h-[44px] text-[10px] font-bold tracking-widest border',
                  !reason || loading
                    ? 'border-[#333333] bg-[#222222] text-[#555555] cursor-not-allowed'
                    : 'border-[#c9a962] bg-[#c9a962] text-[#0a0a0a] hover:bg-[#e0c07f] hover:border-[#e0c07f]',
                  'transition-colors duration-150 shadow-[0_4px_10px_rgba(201,169,98,0.2)]',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                )}
              >
                {loading
                  ? t('common.loading').toUpperCase()
                  : t('insurance.file_claim').toUpperCase()}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
