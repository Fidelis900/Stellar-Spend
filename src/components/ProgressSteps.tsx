import React from 'react';
import { cn } from '@/lib/cn';
import type { ProgressStep } from '@shared/types/stellaramp';

type ProgressStepsProps = {
  isConnected: boolean;
  isConnecting: boolean;
  /** Optional steps provided by useWalletFlow hook */
  steps?: ReadonlyArray<ProgressStep>;
};

export default function ProgressSteps({
  isConnected,
  isConnecting,
  steps: providedSteps,
}: ProgressStepsProps) {
  // Determine active step based on rules:
  // Step 1 is active when wallet is not connected
  // Step 2 is active when wallet is connecting
  // Step 3 is active when wallet is connected and not connecting
  const activeStep = isConnecting ? 2 : !isConnected ? 1 : 3;

  // Fallback to internal steps if none provided (for safety/backward compatibility)
  const steps = providedSteps || [
    {
      id: 's1',
      number: '01',
      title: isConnected ? 'CONNECTED \u2713' : 'CONNECT WALLET',
      description: 'Connect your wallet to begin securely.',
    },
    {
      id: 's2',
      number: '02',
      title: isConnecting ? 'SIGNATURE PENDING' : 'FX LOCK',
      description: 'Lock in exchange rate and sign transaction.',
    },
    {
      id: 's3',
      number: '03',
      title: '\u20A6 PAYOUT',
      description: 'Receive payout directly into your account.',
    },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isActive = activeStep === stepNum;

          return (
            <div
              key={step.id || step.number}
              className={cn(
                'flex flex-col justify-between p-6 transition-all duration-300 min-h-[160px] border',
                isActive
                  ? 'bg-[#c9a962] text-[#111111] shadow-lg scale-[1.02] border-transparent'
                  : 'bg-[#111111] text-[#777777] border-[#333333]',
              )}
            >
              <div className="flex flex-col">
                <span
                  className={cn(
                    'text-4xl font-black tracking-tighter mb-4',
                    isActive ? 'text-[#111111]/40' : 'text-[#444444]',
                  )}
                >
                  {step.number}
                </span>
                <h3
                  className={cn(
                    'text-lg font-bold tracking-wide uppercase',
                    isActive ? 'text-[#111111]' : 'text-white',
                  )}
                >
                  {step.title}
                </h3>
              </div>

              <p
                className={cn(
                  'text-sm mt-3 font-medium leading-relaxed',
                  isActive ? 'text-[#111111]/80' : 'text-[#777777]',
                )}
              >
                {step.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
