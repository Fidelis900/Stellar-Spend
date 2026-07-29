'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

interface TwoFAVerificationProps {
  isOpen: boolean;
  onVerify: (code: string) => Promise<boolean>;
  onCancel: () => void;
  method: 'totp' | 'sms' | 'backup';
}

export function TwoFAVerification({ isOpen, onVerify, onCancel, method }: TwoFAVerificationProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const success = await onVerify(code);
      if (!success) {
        setError('Invalid verification code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const placeholder = method === 'backup' ? 'XXXXXXXX' : '000000';
  const maxLength = method === 'backup' ? 8 : 6;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#333333] p-6 max-w-sm w-full mx-4">
        <h2 className="text-lg font-bold text-white mb-4">
          {method === 'backup' ? 'Enter Backup Code' : 'Enter Verification Code'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#999999] mb-2">
              {method === 'totp' && 'Enter the 6-digit code from your authenticator app'}
              {method === 'sms' && 'Enter the code sent to your phone'}
              {method === 'backup' && 'Enter one of your backup codes'}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, maxLength))}
              placeholder={placeholder}
              maxLength={maxLength}
              className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-white text-sm text-center tracking-widest"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-[#333333] text-white text-xs hover:bg-[#222222] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || code.length < maxLength}
              className={cn(
                'flex-1 px-4 py-2 text-xs font-semibold transition-colors',
                isLoading || code.length < maxLength
                  ? 'bg-[#666666] text-[#999999] cursor-not-allowed'
                  : 'bg-[#c9a962] text-[#0a0a0a] hover:bg-[#d4b574]',
              )}
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
