'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AsyncBoundaryProps {
  isLoading: boolean;
  isEmpty: boolean;
  error?: string | null;
  children: ReactNode;
  loadingContent?: ReactNode;
  emptyContent?: ReactNode;
  errorContent?: (error: string) => ReactNode;
  className?: string;
  loadingClassName?: string;
  emptyClassName?: string;
  errorClassName?: string;
}

/**
 * AsyncBoundary provides a normalized way to handle loading, error, and empty states
 * across list views (history, transactions, notifications, etc).
 *
 * Usage:
 * <AsyncBoundary
 *   isLoading={isLoading}
 *   isEmpty={items.length === 0}
 *   error={error}
 *   loadingContent={<Skeleton />}
 *   emptyContent={<EmptyState />}
 * >
 *   <ItemList items={items} />
 * </AsyncBoundary>
 */
export function AsyncBoundary({
  isLoading,
  isEmpty,
  error,
  children,
  loadingContent,
  emptyContent,
  errorContent,
  className,
  loadingClassName,
  emptyClassName,
  errorClassName,
}: AsyncBoundaryProps) {
  if (isLoading && loadingContent) {
    return (
      <div className={cn('async-boundary-loading', loadingClassName, className)}>
        {loadingContent}
      </div>
    );
  }

  if (error && errorContent) {
    return (
      <div
        role="alert"
        className={cn('async-boundary-error', errorClassName, className)}
      >
        {errorContent(error)}
      </div>
    );
  }

  if (isEmpty && emptyContent) {
    return (
      <div className={cn('async-boundary-empty', emptyClassName, className)}>
        {emptyContent}
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Default loading skeleton for list items
 */
export function ListLoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 bg-[#222222] rounded animate-pulse"
        />
      ))}
    </div>
  );
}

/**
 * Default empty state for lists
 */
export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function ListEmptyState({
  title = 'No items',
  description = 'Nothing to show here yet',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {icon && (
        <div className="mb-4 text-[#333333]" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-[#777777] mb-4">{description}</p>
      {action}
    </div>
  );
}

/**
 * Default error state for lists
 */
export interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export function ListErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-4 text-red-400"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h3 className="text-sm font-semibold text-white mb-1">Failed to load</h3>
      <p className="text-xs text-[#777777] mb-4 text-center max-w-xs">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[10px] text-[#c9a962] hover:text-[#dbb76d] transition-colors uppercase tracking-wider"
        >
          Try again
        </button>
      )}
    </div>
  );
}
