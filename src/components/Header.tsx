'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './ThemeToggle';
import { CopyButton } from './CopyButton';
import { WalletModal } from './WalletModal';
import { LanguageSelector } from '@/lib/i18n/LanguageSelector';
import { NotificationCenter } from './NotificationCenter';
import { useFxRate } from '@/hooks/useFxRate';
import { useNotificationCenter } from '@/hooks/useNotificationCenter';
import type { WalletType } from '@/lib/stellar';

export interface HeaderProps {
  subtitle: string;
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress?: string;
  walletType?: 'Freighter' | 'Lobstr' | null;
  stellarUsdcBalance?: string | null;
  stellarXlmBalance?: string | null;
  isBalanceLoading?: boolean;
  walletError?: string | null;
  onConnect: (walletType?: WalletType) => void;
  onDisconnect: () => void;
  onHelpOpen?: () => void;
  /** Called with the openModal function so parent can trigger the modal */
  onModalRef?: (openModal: () => void) => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function WalletButton({
  isConnected,
  isConnecting,
  walletAddress,
  walletType,
  onOpenModal,
  onDisconnect,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress?: string;
  walletType?: 'Freighter' | 'Lobstr' | null;
  onOpenModal: () => void;
  onDisconnect: () => void;
}) {
  const label = isConnecting
    ? 'CONNECTING...'
    : isConnected && walletAddress
      ? truncateAddress(walletAddress)
      : 'CONNECT WALLET';

  const disabled = isConnecting;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isConnected && walletType && (
        <span className="text-xs text-slate-500 tracking-widest hidden sm:inline">
          {walletType.toUpperCase()}
        </span>
      )}
      {isConnected && walletAddress && (
        <CopyButton text={walletAddress} label="" className="text-xs" keyboardShortcut="w" />
      )}
      <button
        onClick={isConnected ? onDisconnect : onOpenModal}
        disabled={disabled}
        aria-label={isConnected ? 'Disconnect wallet' : 'Connect wallet'}
        className={cn(
          'px-4 py-2 min-h-[44px] text-xs tracking-widest border transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a962] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]',
          'border-[#c9a962] bg-[#0a0a0a] text-[#c9a962]',
          !disabled && 'hover:bg-[#c9a962] hover:text-[#0a0a0a]',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {label}
      </button>
    </div>
  );
}

export function Header({
  subtitle,
  isConnected,
  isConnecting,
  walletAddress,
  walletType,
  stellarUsdcBalance,
  stellarXlmBalance,
  isBalanceLoading,
  walletError,
  onConnect,
  onDisconnect,
  onHelpOpen,
  onModalRef,
}: HeaderProps) {
  const { rate, flash } = useFxRate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);

  // Load notifications
  const notificationCenter = useNotificationCenter(isConnected ? walletAddress || null : null);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  // Expose openModal to parent via callback ref
  useEffect(() => {
    onModalRef?.(handleOpenModal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onModalRef]);

  const handleCloseModal = () => {
    if (!isConnecting) setIsModalOpen(false);
  };

  const handleConnectWallet = async (walletType: WalletType) => {
    setConnectingWallet(walletType);
    await onConnect(walletType);
    setConnectingWallet(null);
    // Close modal on success (no error)
    if (!walletError) setIsModalOpen(false);
  };

  // Close modal when connection succeeds
  if (isConnected && isModalOpen) {
    setIsModalOpen(false);
  }

  return (
    <>
      <header
        className="w-full px-6 py-5 flex items-start justify-between gap-6 max-[720px]:flex-col max-[720px]:items-start"
        role="banner"
      >
        {/* Left: title + subtitle + FX chip */}
        <div className="flex flex-col gap-1">
          <h1
            className="font-space-grotesk font-bold text-white leading-none tracking-tight"
            style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}
          >
            STELLAR-SPEND
          </h1>
          <p className="text-xs text-[#777777] tracking-widest uppercase">{subtitle}</p>
          <span
            aria-live="polite"
            aria-label="Live FX rate"
            className={cn(
              'mt-1 inline-block self-start px-2 py-0.5 text-[10px] tracking-widest uppercase border border-[#c9a962]/40 text-[#c9a962] transition-colors duration-300',
              flash && 'bg-[#c9a962]/20',
            )}
          >
            {rate != null
              ? `LIVE RATE: ₦${Math.round(rate).toLocaleString()} / USDC`
              : 'LIVE RATE: —'}
          </span>
        </div>

        {/* Right: notifications + wallet button + balances */}
        <div className="flex flex-col items-end gap-2 max-[720px]:items-start">
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button
              onClick={onHelpOpen}
              aria-label="Open help"
              className={cn(
                'p-2 text-[#777777] hover:text-[#c9a962] transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
              )}
              title="Help & Documentation (Shift + ?)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
            </button>
            <ThemeToggle />
            {isConnected && (
              <NotificationCenter
                events={notificationCenter.events}
                unreadCount={notificationCenter.unreadCount}
                unreadBadgeText={notificationCenter.unreadBadgeText}
                loading={notificationCenter.loading}
                onMarkAsRead={notificationCenter.markAsRead}
                onMarkAllAsRead={notificationCenter.markAllAsRead}
                onRemoveEvent={notificationCenter.removeEvent}
                onClearAll={notificationCenter.clearAll}
              />
            )}
            <WalletButton
              isConnected={isConnected}
              isConnecting={isConnecting}
              walletAddress={walletAddress}
              walletType={walletType}
              onOpenModal={handleOpenModal}
              onDisconnect={onDisconnect}
            />
          </div>

          {isConnected && (
            <div className="flex flex-col items-end gap-0.5 max-[720px]:items-start">
              {isBalanceLoading ? (
                <span className="text-xs text-[#777777] tracking-widest">loading...</span>
              ) : (
                <>
                  <span className="text-xs text-[#c9a962] tracking-wider">
                    {stellarUsdcBalance ?? '—'} USDC
                  </span>
                  <span className="text-xs text-[#777777] tracking-wider">
                    {stellarXlmBalance ?? '—'} XLM
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Wallet selection modal */}
      <WalletModal
        isOpen={isModalOpen}
        isConnecting={isConnecting}
        connectingWallet={connectingWallet}
        error={walletError ?? null}
        onConnect={handleConnectWallet}
        onClose={handleCloseModal}
      />
    </>
  );
}
