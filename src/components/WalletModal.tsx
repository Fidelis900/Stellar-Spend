'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { WalletType } from '@/lib/stellar/wallet-adapter';
import { useFocusTrap, useFocusRestore } from '@/hooks/useFocusTrap';

export interface WalletModalProps {
  isOpen: boolean;
  isConnecting: boolean;
  connectingWallet: WalletType | null;
  error: string | null;
  onConnect: (walletType: WalletType) => void;
  onClose: () => void;
}

interface WalletOption {
  type: WalletType;
  name: string;
  description: string;
  icon: React.ReactNode;
  installUrl: string;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    type: 'freighter',
    name: 'Freighter',
    description: 'Official Stellar browser extension wallet',
    installUrl: 'https://www.freighter.app/',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#5B4FE9" />
        <path
          d="M8 16C8 11.582 11.582 8 16 8C20.418 8 24 11.582 24 16C24 20.418 20.418 24 16 24"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M16 12V16L19 19"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="22" r="2" fill="white" />
      </svg>
    ),
  },
  {
    type: 'lobstr',
    name: 'LOBSTR',
    description: 'Popular Stellar wallet with mobile & browser support',
    installUrl: 'https://lobstr.co/',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1A1A2E" />
        <path
          d="M16 6L26 11V21L16 26L6 21V11L16 6Z"
          stroke="#00D4FF"
          strokeWidth="1.5"
          fill="none"
        />
        <path d="M16 10L22 13.5V20.5L16 24L10 20.5V13.5L16 10Z" fill="#00D4FF" fillOpacity="0.2" />
        <circle cx="16" cy="17" r="3" fill="#00D4FF" />
      </svg>
    ),
  },
];

export function WalletModal({
  isOpen,
  isConnecting,
  connectingWallet,
  error,
  onConnect,
  onClose,
}: WalletModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const [dismissed, setDismissed] = useState(false);

  useFocusTrap(overlayRef, isOpen);
  useFocusRestore(isOpen);

  // Focus first wallet option when modal opens
  useEffect(() => {
    if (isOpen) {
      setDismissed(false);
      setTimeout(() => firstButtonRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isConnecting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isConnecting, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !isConnecting) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <div className="relative w-full max-w-sm mx-4 bg-[#111111] border border-[#333333] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#333333]">
          <div>
            <h2
              id="wallet-modal-title"
              className="text-sm font-bold tracking-[0.15em] text-white uppercase"
            >
              Connect Wallet
            </h2>
            <p className="text-[10px] text-[#777777] tracking-wider mt-0.5">
              Choose your Stellar wallet
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isConnecting}
            aria-label="Close wallet modal"
            className={cn(
              'p-1.5 text-[#777777] hover:text-white transition-colors duration-150',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
              isConnecting && 'opacity-40 cursor-not-allowed',
            )}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Wallet options */}
        <div className="p-4 flex flex-col gap-3">
          {WALLET_OPTIONS.map((wallet, i) => {
            const isThisConnecting = isConnecting && connectingWallet === wallet.type;
            const isOtherConnecting = isConnecting && connectingWallet !== wallet.type;

            return (
              <button
                key={wallet.type}
                ref={i === 0 ? firstButtonRef : undefined}
                onClick={() => onConnect(wallet.type)}
                disabled={isConnecting}
                aria-label={`Connect with ${wallet.name}`}
                aria-busy={isThisConnecting}
                className={cn(
                  'flex items-center gap-4 w-full px-4 py-4 border text-left',
                  'transition-all duration-150',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                  isThisConnecting
                    ? 'border-[#c9a962] bg-[#c9a962]/10 animate-pulse'
                    : isOtherConnecting
                      ? 'border-[#222222] bg-[#0a0a0a] opacity-40 cursor-not-allowed'
                      : 'border-[#333333] bg-[#0a0a0a] hover:border-[#c9a962]/60 hover:bg-[#c9a962]/5',
                )}
              >
                {/* Icon */}
                <div className="shrink-0">{wallet.icon}</div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white tracking-wide">
                      {wallet.name}
                    </span>
                    {isThisConnecting && (
                      <span className="text-[10px] text-[#c9a962] tracking-widest uppercase animate-pulse">
                        Connecting…
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#777777] mt-0.5 leading-relaxed">
                    {wallet.description}
                  </p>
                </div>

                {/* Arrow */}
                {!isThisConnecting && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 text-[#555555]"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 3L11 8L6 13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Error message */}
        {error && !dismissed && (
          <div className="mx-4 mb-4 px-4 py-3 border border-red-500/30 bg-red-500/10 flex items-start gap-3">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="text-red-400 shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11" r="0.75" fill="currentColor" />
            </svg>
            <div className="flex-1">
              <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss error"
              className="text-red-400/60 hover:text-red-400 transition-colors shrink-0"
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
        )}

        {/* Footer: install links */}
        <div className="px-6 py-4 border-t border-[#222222] flex items-center justify-between">
          <p className="text-[10px] text-[#555555] tracking-wide">Don&apos;t have a wallet?</p>
          <div className="flex gap-3">
            {WALLET_OPTIONS.map((w) => (
              <a
                key={w.type}
                href={w.installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'text-[10px] tracking-widest uppercase text-[#c9a962]',
                  'hover:underline focus:outline-none focus-visible:underline',
                )}
                aria-label={`Install ${w.name}`}
              >
                Get {w.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
