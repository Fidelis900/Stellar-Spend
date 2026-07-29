'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { OfframpStep } from '@/types/stellaramp';
import { CopyButton } from './CopyButton';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { TransactionReceipt, type ReceiptData } from './TransactionReceipt';
import { useFocusTrap, useFocusRestore } from '@/hooks/useFocusTrap';

// ---------------------------------------------------------------------------
// Per-step metadata: label, sub-message, ETA seconds
// ---------------------------------------------------------------------------

const STEP_ORDER: OfframpStep[] = [
  'initiating',
  'awaiting-signature',
  'submitting',
  'processing',
  'settling',
  'success',
];

interface StepMeta {
  label: string;
  message: string;
  etaSeconds: number;
}

const STEP_META: Record<OfframpStep, StepMeta> = {
  idle: { label: 'Idle', message: '', etaSeconds: 0 },
  initiating: {
    label: 'Initiating',
    message: 'Preparing your transaction details…',
    etaSeconds: 5,
  },
  'awaiting-signature': {
    label: 'Awaiting Signature',
    message: 'Please approve the transaction in your wallet.',
    etaSeconds: 30,
  },
  submitting: {
    label: 'Submitting to Network',
    message: 'Broadcasting to the Stellar network…',
    etaSeconds: 10,
  },
  processing: {
    label: 'Processing On-Chain',
    message: 'Waiting for on-chain confirmation…',
    etaSeconds: 20,
  },
  settling: {
    label: 'Settling Fiat Payout',
    message: 'Transferring funds to your bank account…',
    etaSeconds: 60,
  },
  success: {
    label: 'Transaction Complete',
    message: 'Funds have been sent to your bank account.',
    etaSeconds: 0,
  },
  error: {
    label: 'Transaction Failed',
    message: 'Something went wrong. See details below.',
    etaSeconds: 0,
  },
};

// ---------------------------------------------------------------------------
// ETA countdown hook
// ---------------------------------------------------------------------------

function useEtaCountdown(step: OfframpStep): number {
  const [remaining, setRemaining] = useState(0);
  const stepRef = useRef<OfframpStep | null>(null);

  useEffect(() => {
    const eta = STEP_META[step]?.etaSeconds ?? 0;
    if (step === stepRef.current || eta === 0) {
      setRemaining(eta);
      stepRef.current = step;
      return;
    }
    stepRef.current = step;
    setRemaining(eta);

    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Progress bar (% through active steps)
// ---------------------------------------------------------------------------

function progressPercent(step: OfframpStep): number {
  if (step === 'success') return 100;
  if (step === 'error' || step === 'idle') return 0;
  const idx = STEP_ORDER.indexOf(step);
  return idx < 0 ? 0 : Math.round(((idx + 1) / (STEP_ORDER.length - 1)) * 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type TransactionProgressModalProps = {
  step: OfframpStep;
  errorMessage?: string;
  txHash?: string;
  receipt?: ReceiptData;
  onClose: () => void;
};

export function TransactionProgressModal({
  step,
  errorMessage,
  txHash,
  receipt,
  onClose,
}: TransactionProgressModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const prevStep = useRef<OfframpStep>('idle');
  const eta = useEtaCountdown(step);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isVisible);
  useFocusRestore(isVisible);

  useEffect(() => {
    if (step !== 'idle') setIsVisible(true);
    else setIsVisible(false);

    // Trigger shake animation whenever we enter error state
    if (step === 'error' && prevStep.current !== 'error') {
      setShakeKey((k) => k + 1);
    }
    prevStep.current = step;
  }, [step]);

  const isTerminal = step === 'success' || step === 'error';
  const isError = step === 'error';
  const pct = progressPercent(step);
  const meta = STEP_META[step];

  useKeyboardNavigation({
    onEscape: () => {
      if (isTerminal) onClose();
    },
    enabled: isVisible && isTerminal,
  });

  if (!isVisible || step === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => isTerminal && onClose()}
      />

      {/* Modal card */}
      <div
        ref={dialogRef}
        key={shakeKey}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        aria-live="polite"
        className={cn(
          'relative w-full max-w-md bg-[#0a0a0a] border border-[#333333] overflow-hidden',
          'shadow-[0_0_50px_rgba(201,169,98,0.15)]',
          isError && 'modal-shake',
        )}
      >
        {/* Racing border — active steps only */}
        {!isTerminal && (
          <div className="absolute inset-0 pointer-events-none racing-border-wrapper">
            <div className="absolute inset-[2px] racing-border-content" />
          </div>
        )}

        <div className="relative p-4 sm:p-8 flex flex-col items-center">
          {/* Status Icon */}
          <div className="mb-8 relative h-20 w-20 flex items-center justify-center">
            {step === 'success' ? (
              <div className="h-16 w-16 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center animate-[scale-in_0.5s_ease-out]">
                <CheckIcon className="w-8 h-8 text-green-500" />
              </div>
            ) : step === 'error' ? (
              <div className="h-16 w-16 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center animate-[shake_0.5s_ease-in-out]">
                <XIcon className="w-8 h-8 text-red-500" />
              </div>
            ) : (
              <div className="h-16 w-16 border-2 border-[#c9a962]/30 border-t-[#c9a962] rounded-full animate-spin" />
            )}
          </div>

          {/* Title */}
          <h2
            id="modal-title"
            className={cn(
              'text-xl font-bold tracking-widest uppercase mb-1',
              isError ? 'text-red-400' : step === 'success' ? 'text-green-400' : 'text-white',
            )}
          >
            {isError ? 'FAILED' : step === 'success' ? 'SUCCESS' : 'IN PROGRESS'}
          </h2>

          {/* Current step label */}
          <p
            id="modal-description"
            className="text-xs text-[#777777] tracking-[0.2em] uppercase mb-1 text-center"
          >
            {meta.label}
          </p>

          {/* Status message */}
          <p className="text-xs text-[#aaaaaa] text-center mb-4 leading-relaxed min-h-[1.5rem]">
            {meta.message}
          </p>

          {/* ETA countdown — active non-terminal steps */}
          {!isTerminal && eta > 0 && (
            <div className="mb-6 flex items-center gap-2 text-[10px] text-[#555555] tracking-widest uppercase">
              <span>Est.</span>
              <span className="tabular-nums text-[#c9a962]">{eta}s</span>
              <span>remaining</span>
            </div>
          )}

          {/* Step list */}
          {!isTerminal && (
            <div className="w-full flex flex-col gap-3 mb-2">
              {STEP_ORDER.filter((s) => s !== 'success').map((s, idx) => {
                const activeIdx = STEP_ORDER.indexOf(step);
                const isCompleted = activeIdx > idx;
                const isActive = activeIdx === idx;

                return (
                  <div
                    key={s}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2 transition-all duration-300',
                      isActive && 'bg-[#c9a962]/5 border-l-2 border-[#c9a962]',
                      !isActive && 'border-l-2 border-transparent',
                    )}
                  >
                    {/* Dot */}
                    <div className="mt-0.5 flex-shrink-0">
                      {isCompleted ? (
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                      ) : isActive ? (
                        <div className="h-2 w-2 rounded-full bg-[#c9a962] animate-pulse" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-[#333333]" />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          'text-[10px] tracking-[0.1em] uppercase font-semibold',
                          isCompleted
                            ? 'text-green-500/60'
                            : isActive
                              ? 'text-white'
                              : 'text-[#444444]',
                        )}
                      >
                        {STEP_META[s].label}
                      </span>
                      {isActive && (
                        <span className="text-[10px] text-[#777777] leading-relaxed">
                          {STEP_META[s].message}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error details */}
          {isError && errorMessage && (
            <div className="w-full mt-2 p-4 bg-red-500/10 border border-red-500/20">
              <p className="text-[10px] text-red-400 font-mono break-words leading-relaxed text-center">
                {errorMessage}
              </p>
            </div>
          )}

          {/* Success details */}
          {step === 'success' &&
            (receipt ? (
              <div className="w-full mt-2">
                <TransactionReceipt data={receipt} />
              </div>
            ) : txHash ? (
              <div className="w-full flex flex-col gap-2 items-center mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#777777]">TX Hash:</span>
                  <code className="text-xs text-[#c9a962] font-mono">
                    {txHash.slice(0, 8)}…{txHash.slice(-8)}
                  </code>
                  <CopyButton text={txHash} label="" className="text-xs" />
                </div>
                <a
                  href={`https://stellar.expert/explorer/public/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#c9a962] hover:text-[#d4b982] transition-colors underline decoration-dotted"
                >
                  View on Stellar Explorer →
                </a>
              </div>
            ) : null)}

          {/* Dismiss */}
          {isTerminal && (
            <button
              onClick={onClose}
              autoFocus
              className={cn(
                'mt-6 w-full py-3 text-xs font-bold tracking-[0.2em] transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]',
                isError
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                  : 'bg-[#c9a962] text-black hover:bg-[#d4b982]',
              )}
            >
              DISMISS
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes rotate-border {
          to {
            --angle: 360deg;
          }
        }

        @keyframes modal-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          15% {
            transform: translateX(-6px);
          }
          30% {
            transform: translateX(6px);
          }
          45% {
            transform: translateX(-4px);
          }
          60% {
            transform: translateX(4px);
          }
          75% {
            transform: translateX(-2px);
          }
          90% {
            transform: translateX(2px);
          }
        }

        @keyframes icon-shake {
          0%,
          100% {
            transform: scale(1) rotate(0deg);
          }
          20% {
            transform: scale(1.1) rotate(-8deg);
          }
          40% {
            transform: scale(1.1) rotate(8deg);
          }
          60% {
            transform: scale(1.05) rotate(-4deg);
          }
          80% {
            transform: scale(1.05) rotate(4deg);
          }
        }

        .modal-shake {
          animation: modal-shake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
        .icon-shake {
          animation: icon-shake 0.6s ease-in-out both;
        }
      `}</style>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
