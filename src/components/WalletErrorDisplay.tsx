'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { WalletError } from '@/lib/wallets';

interface WalletErrorDisplayProps {
  error: WalletError | null;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * WalletErrorDisplay
 *
 * Displays wallet-related errors with context-appropriate messaging and actions.
 * Shows actionable guidance for common wallet issues.
 */
export function WalletErrorDisplay({
  error,
  onDismiss,
  actionLabel,
  onAction,
  className,
}: WalletErrorDisplayProps) {
  const [isVisible, setIsVisible] = useState(!!error);

  useEffect(() => {
    setIsVisible(!!error);
  }, [error]);

  if (!error || !isVisible) return null;

  const getErrorIcon = () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.75" fill="currentColor" />
    </svg>
  );

  const getErrorSuggestion = () => {
    if (!error.code) return null;

    switch (error.code) {
      case 'WALLET_NOT_AVAILABLE':
        return (
          <div className="text-[11px] text-red-300 mt-2 space-y-1">
            <p>Wallet extension not installed. Try:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Install Freighter or Lobstr extension</li>
              <li>Refresh the page after installation</li>
            </ul>
          </div>
        );
      case 'WALLET_CONNECTION_ERROR':
        if (error.message?.includes('locked')) {
          return (
            <div className="text-[11px] text-red-300 mt-2">
              <p>Your wallet appears to be locked.</p>
              <p className="mt-1">Unlock it in the extension and try again.</p>
            </div>
          );
        }
        if (error.message?.includes('rejected') || error.message?.includes('declined')) {
          return (
            <div className="text-[11px] text-red-300 mt-2">
              <p>You declined the connection request.</p>
              <p className="mt-1">Approve it in your wallet popup to continue.</p>
            </div>
          );
        }
        if (error.message?.includes('network') || error.message?.includes('testnet')) {
          return (
            <div className="text-[11px] text-red-300 mt-2">
              <p>Wrong network selected in your wallet.</p>
              <p className="mt-1">Switch to Mainnet and try again.</p>
            </div>
          );
        }
        break;
      case 'WALLET_SIGNING_ERROR':
        if (error.message?.includes('rejected') || error.message?.includes('declined')) {
          return (
            <div className="text-[11px] text-red-300 mt-2">
              <p>Transaction rejected in your wallet.</p>
              <p className="mt-1">Review and approve the transaction to continue.</p>
            </div>
          );
        }
        if (error.message?.includes('locked')) {
          return (
            <div className="text-[11px] text-red-300 mt-2">
              <p>Wallet is locked for signing.</p>
              <p className="mt-1">Unlock it and try again.</p>
            </div>
          );
        }
        break;
      case 'ACCOUNT_CHANGED':
        return (
          <div className="text-[11px] text-red-300 mt-2">
            <p>Your wallet account changed. Reconnecting...</p>
            <p className="mt-1">You may need to re-authorize the connection.</p>
          </div>
        );
      default:
        break;
    }

    return null;
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        'relative px-4 py-3 border border-red-500/30 bg-red-500/10 rounded',
        'flex items-start gap-3',
        className,
      )}
      role="alert"
      aria-live="polite"
    >
      {/* Icon */}
      <div className="text-red-400 mt-0.5">{getErrorIcon()}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-red-400">{error.message}</p>
        {getErrorSuggestion()}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className={cn(
              'text-[10px] tracking-widest uppercase text-red-400',
              'hover:text-red-300 transition-colors',
              'focus:outline-none focus-visible:underline',
            )}
          >
            {actionLabel}
          </button>
        )}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss error"
          className="text-red-400/60 hover:text-red-400 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
