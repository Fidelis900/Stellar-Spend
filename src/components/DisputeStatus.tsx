'use client';

import { Dispute } from '@shared/types/disputes';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

interface DisputeStatusProps {
  dispute: Dispute;
}

export function DisputeStatus({ dispute }: DisputeStatusProps) {
  const { t } = useI18n();

  const statusColors: Record<string, string> = {
    open: 'bg-yellow-900/20 text-yellow-500 border-yellow-500/30',
    in_review: 'bg-blue-900/20 text-blue-400 border-blue-500/30',
    resolved: 'bg-green-900/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-900/20 text-red-400 border-red-500/30',
  };

  const statusLabels: Record<string, string> = {
    open: 'Open',
    in_review: 'In Review',
    resolved: 'Resolved',
    rejected: 'Rejected',
  };

  return (
    <div className="space-y-4 p-4 border border-[#222222] bg-[#0a0a0a] animate-in fade-in duration-500">
      <div className="flex items-center justify-between border-b border-[#222222] pb-3">
        <span className="text-[10px] tracking-widest uppercase text-[#777777] font-bold">
          {t('dispute.status')}
        </span>
        <span
          className={cn(
            'px-3 py-1 border text-[10px] font-black uppercase tracking-widest',
            statusColors[dispute.status],
          )}
        >
          {statusLabels[dispute.status]}
        </span>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] tracking-widest uppercase text-[#777777] font-bold">
          {t('dispute.reason')}
        </span>
        <p className="text-xs text-white font-medium">{dispute.reason}</p>
      </div>

      {dispute.description && (
        <div className="space-y-1">
          <span className="text-[10px] tracking-widest uppercase text-[#777777] font-bold">
            {t('dispute.description')}
          </span>
          <p className="text-xs text-[#aaaaaa] leading-relaxed">{dispute.description}</p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 text-[9px] text-[#555555] uppercase tracking-widest font-mono">
        <span className="w-1 h-1 rounded-full bg-[#333333]" />
        {t('dispute.created')}: {new Date(dispute.createdAt).toLocaleString()}
      </div>

      {dispute.resolutionNotes && (
        <div className="bg-[#111111] border border-[#222222] p-3 space-y-2">
          <span className="text-[10px] tracking-widest uppercase text-[#c9a962] font-bold">
            {t('dispute.resolution_notes')}
          </span>
          <p className="text-xs text-[#aaaaaa] italic leading-relaxed">
            "{dispute.resolutionNotes}"
          </p>
        </div>
      )}

      {dispute.status === 'open' || dispute.status === 'in_review' ? (
        <div className="mt-4 p-3 bg-blue-900/10 border border-blue-500/20 rounded">
          <p className="text-[10px] text-blue-400 italic">{t('dispute.sla_notice')}</p>
        </div>
      ) : null}
    </div>
  );
}
