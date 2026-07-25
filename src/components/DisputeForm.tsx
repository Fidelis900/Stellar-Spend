'use client';

import { useState, useRef } from 'react';
import { CreateDisputeRequest } from '@/types/disputes';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

interface DisputeFormProps {
  transactionId: string;
  onSubmit: (data: CreateDisputeRequest) => Promise<void>;
  onCancel?: () => void;
}

export function DisputeForm({ transactionId, onSubmit, onCancel }: DisputeFormProps) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const reasons = [
    'Funds not received',
    'Incorrect amount',
    'Wrong recipient',
    'Duplicate transaction',
    'Other',
  ];

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSubmit({
        transactionId,
        reason,
        description: description || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit dispute');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-300">
      <div className="space-y-1.5">
        <label htmlFor="dispute-reason" className="block text-[10px] tracking-widest uppercase text-[#777777] font-bold">
          {t('dispute.reason')} *
        </label>
        <select
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? 'dispute-error' : undefined}
          className="w-full bg-[#111111] border border-[#333333] px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#c9a962] appearance-none cursor-pointer"
        >
          <option value="">Select a reason...</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="dispute-description" className="block text-[10px] tracking-widest uppercase text-[#777777] font-bold">
          {t('dispute.description')}
        </label>
        <textarea
          id="dispute-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Provide additional details about the dispute..."
          rows={4}
          className="w-full bg-[#111111] border border-[#333333] px-3 py-2.5 text-xs text-white placeholder-[#555555] focus:outline-none focus:border-[#c9a962] resize-none"
        />
      </div>

      {/* Document Upload */}
      <div className="space-y-1.5">
        <span id="dispute-document-label" className="block text-[10px] tracking-widest uppercase text-[#777777] font-bold">
          {t('insurance.upload_document')}
        </span>
        <input
          type="file"
          id="dispute-document"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="sr-only"
          tabIndex={-1}
          aria-label={t('insurance.upload_document')}
          accept="image/*,application/pdf"
        />
        <div
          role="button"
          tabIndex={0}
          aria-labelledby="dispute-document-label"
          aria-describedby="dispute-document-hint"
          aria-controls="dispute-document"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "border-2 border-dashed border-[#333333] p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#c9a962] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a962] transition-colors bg-[#0a0a0a]",
            filePreview && "border-[#c9a962] bg-[#c9a962]/5"
          )}
        >
          {filePreview ? (
            <div className="flex flex-col items-center gap-2">
              {selectedFile?.type.startsWith('image/') ? (
                <img src={filePreview} alt="Preview" className="h-20 w-auto object-contain border border-[#333333]" />
              ) : (
                <div className="w-12 h-12 bg-[#222222] flex items-center justify-center text-xs">PDF</div>
              )}
              <span className="text-[10px] text-white truncate max-w-[200px] font-mono">{selectedFile?.name}</span>
            </div>
          ) : (
            <>
              <span className="text-xl opacity-30">↑</span>
              <span className="text-[10px] text-[#555555] uppercase tracking-widest">JPG, PNG or PDF (max 5MB)</span>
            </>
          )}
        </div>
        <span id="dispute-document-hint" className="sr-only">
          Optional supporting document. Accepted formats: JPG, PNG or PDF, up to 5MB.
        </span>
      </div>

      <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded">
        <p className="text-[10px] text-blue-400 italic">
          {t('dispute.sla_notice')}
        </p>
      </div>

      {error && (
        <div
          id="dispute-error"
          role="alert"
          aria-live="assertive"
          className="text-red-400 text-xs font-bold uppercase tracking-tight"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!reason || loading}
          className="flex-1 py-3 bg-[#c9a962] text-[#0a0a0a] text-[10px] font-black uppercase tracking-widest hover:bg-[#d4b97a] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_10px_rgba(201,169,98,0.2)]"
        >
          {loading ? t('common.loading').toUpperCase() : t('dispute.submit').toUpperCase()}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-[#333333] text-[#777777] text-[10px] font-black uppercase tracking-widest hover:border-[#555555] hover:text-white transition-all"
          >
            {t('common.cancel').toUpperCase()}
          </button>
        )}
      </div>
    </form>
  );
}

