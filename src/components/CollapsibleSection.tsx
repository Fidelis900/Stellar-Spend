'use client';

import { cn } from '@/lib/cn';
import { useProgressiveDisclosure } from '@/hooks/useProgressiveDisclosure';

export interface CollapsibleSectionProps {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  title,
  description,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const { isOpen, toggle, isMounted } = useProgressiveDisclosure(id, defaultOpen);

  if (!isMounted) {
    return null;
  }

  return (
    <div className={cn('border border-[#333333] bg-[#0a0a0a]', className)}>
      <button
        onClick={toggle}
        className={cn(
          'w-full px-4 py-3 flex items-center justify-between',
          'hover:bg-[#1a1a1a] transition-colors duration-150',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
        )}
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
      >
        <div className="flex flex-col items-start gap-1">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {description && <p className="text-xs text-[#777777]">{description}</p>}
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn(
            'text-[#c9a962] transition-transform duration-200 flex-shrink-0 ml-2',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div
          id={`${id}-content`}
          className={cn(
            'border-t border-[#333333] px-4 py-3',
            'animate-in fade-in slide-in-from-top-2 duration-200',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
