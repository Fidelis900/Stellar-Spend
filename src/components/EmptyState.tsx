'use client';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}
      role="status"
      aria-label={title}
    >
      {icon && (
        <div className="mb-4 text-[#c9a962]" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      {description && <p className="text-sm text-[#777777] mb-6 max-w-sm">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            'text-[10px] tracking-widest uppercase text-[#c9a962] border border-[#c9a962] px-4 py-2 min-h-[44px] flex items-center',
            'hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors duration-150',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
