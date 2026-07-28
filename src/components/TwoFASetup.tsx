'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

interface TwoFASetupProps {
  userId: string;
  onSuccess: (backupCodes: string[]) => void;
  onCancel: () => void;
}

export function TwoFASetup({ userId, onSuccess, onCancel }: TwoFASetupProps) {
  const [method, setMethod] = useState<'totp' | 'sms'>('totp');
  const [step, setStep] = useState<'method' | 'setup' | 'verify'>('method');
  const [setupData, setSetupData] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleMethodSelect = async (selectedMethod: 'totp' | 'sms') => {
    setMethod(selectedMethod);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, method: selectedMethod }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Setup failed');
      }

      const data = await res.json();
      setSetupData(data);
      setStep('setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          code: verificationCode,
          method,
          secret: setupData.secret,
          backupCodes: setupData.backupCodes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Verification failed');
      }

      onSuccess(setupData.backupCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#333333] p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-white mb-4">Set Up 2FA</h2>

        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-[#999999] mb-4">Choose your preferred 2FA method</p>
            <button
              onClick={() => handleMethodSelect('totp')}
              disabled={isLoading}
              className={cn(
                'w-full p-4 border text-left transition-colors',
                method === 'totp'
                  ? 'border-[#c9a962] bg-[#c9a962]/10'
                  : 'border-[#333333] hover:border-[#555555]',
              )}
            >
              <div className="font-semibold text-white">Authenticator App (TOTP)</div>
              <div className="text-xs text-[#999999] mt-1">
                Use Google Authenticator, Authy, or similar
              </div>
            </button>

            <button
              onClick={() => handleMethodSelect('sms')}
              disabled={isLoading}
              className={cn(
                'w-full p-4 border text-left transition-colors',
                method === 'sms'
                  ? 'border-[#c9a962] bg-[#c9a962]/10'
                  : 'border-[#333333] hover:border-[#555555]',
              )}
            >
              <div className="font-semibold text-white">SMS</div>
              <div className="text-xs text-[#999999] mt-1">Receive codes via text message</div>
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-[#333333] text-white text-xs hover:bg-[#222222] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMethodSelect(method)}
                disabled={isLoading}
                className={cn(
                  'flex-1 px-4 py-2 text-xs font-semibold transition-colors',
                  isLoading
                    ? 'bg-[#666666] text-[#999999] cursor-not-allowed'
                    : 'bg-[#c9a962] text-[#0a0a0a] hover:bg-[#d4b574]',
                )}
              >
                {isLoading ? 'Setting up...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 'setup' && setupData && (
          <div className="space-y-4">
            {method === 'totp' && (
              <div>
                <p className="text-sm text-[#999999] mb-3">
                  Scan this QR code with your authenticator app:
                </p>
                <div className="bg-white p-4 flex items-center justify-center mb-4">
                  <div className="text-xs text-[#0a0a0a]">[QR Code: {setupData.uri}]</div>
                </div>
                <p className="text-xs text-[#999999] mb-2">Or enter this secret manually:</p>
                <code className="block bg-[#0a0a0a] border border-[#333333] p-2 text-xs text-[#c9a962] break-all mb-4">
                  {setupData.secret}
                </code>
              </div>
            )}

            {method === 'sms' && (
              <div>
                <label className="block text-xs text-[#999999] mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-white text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-[#999999] mb-2">Enter verification code</label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-white text-sm text-center tracking-widest"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => setStep('method')}
                className="flex-1 px-4 py-2 border border-[#333333] text-white text-xs hover:bg-[#222222] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleVerify}
                disabled={isLoading}
                className={cn(
                  'flex-1 px-4 py-2 text-xs font-semibold transition-colors',
                  isLoading
                    ? 'bg-[#666666] text-[#999999] cursor-not-allowed'
                    : 'bg-[#c9a962] text-[#0a0a0a] hover:bg-[#d4b574]',
                )}
              >
                {isLoading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
