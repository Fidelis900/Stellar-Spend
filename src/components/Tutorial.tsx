'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'stellar-spend:tutorial-completed';

const STEPS = [
  {
    title: 'Connect your wallet',
    description:
      'Click "Connect Wallet" in the header to link your Freighter or Lobstr Stellar wallet.',
  },
  {
    title: 'Enter an amount',
    description:
      'Type the USDC/USDT amount you want to convert, or enter the fiat amount you want to receive.',
  },
  {
    title: 'Choose currency & bank',
    description:
      'Select your target fiat currency (NGN, KES, GHS…) and enter your bank account details.',
  },
  {
    title: 'Review the quote',
    description:
      'Check the live exchange rate and fees shown in the right panel before confirming.',
  },
  {
    title: 'Confirm & sign',
    description:
      'Click Send and approve the transaction in your wallet. Funds arrive in your bank within minutes.',
  },
];

interface TutorialProps {
  /** Force the tutorial open regardless of completion status (for re-access). */
  forceOpen?: boolean;
  onClose?: () => void;
}

export function Tutorial({ forceOpen = false, onClose }: TutorialProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setVisible(true);
      setStep(0);
      return;
    }
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setVisible(true);
    } catch {
      // localStorage unavailable (SSR / private mode) — show tutorial
      setVisible(true);
    }
  }, [forceOpen]);

  const dismiss = useCallback(
    (completed: boolean) => {
      if (completed) {
        try {
          localStorage.setItem(STORAGE_KEY, '1');
        } catch {
          // ignore
        }
      }
      setVisible(false);
      onClose?.();
    },
    [onClose],
  );

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss(true);
    }
  };

  const handleSkip = () => dismiss(true);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started tutorial"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md border border-[#333] bg-[#111] p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#888] uppercase tracking-widest">Getting started</span>
          <button
            onClick={handleSkip}
            aria-label="Skip tutorial"
            className="text-xs text-[#555] hover:text-[#888] transition-colors"
          >
            Skip
          </button>
        </div>

        {/* Step content */}
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[#888]">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-white font-medium">{current.title}</h2>
          <p className="text-[#aaa] text-sm leading-relaxed">{current.description}</p>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 transition-colors ${i <= step ? 'bg-white' : 'bg-[#333]'}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 text-sm border border-[#333] text-[#888] hover:border-[#555] transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="px-4 py-2 text-sm border border-white text-white hover:bg-white hover:text-black transition-colors"
          >
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Returns a function that re-opens the tutorial (for menu/help links). */
export function useTutorial() {
  const [open, setOpen] = useState(false);
  const openTutorial = useCallback(() => setOpen(true), []);
  const closeTutorial = useCallback(() => setOpen(false), []);
  return { open, openTutorial, closeTutorial };
}
