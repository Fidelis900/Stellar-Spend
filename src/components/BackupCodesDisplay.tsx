'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

interface BackupCodesDisplayProps {
  codes: string[];
  onClose: () => void;
}

export function BackupCodesDisplay({ codes, onClose }: BackupCodesDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([codes.join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'stellar-spend-backup-codes.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#333333] p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-white mb-2">Save Your Backup Codes</h2>
        <p className="text-xs text-[#999999] mb-4">
          Store these codes in a safe place. You can use them to access your account if you lose
          access to your 2FA device.
        </p>

        <div className="bg-[#0a0a0a] border border-[#333333] p-4 mb-4 max-h-48 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {codes.map((code, idx) => (
              <div
                key={idx}
                className="font-mono text-xs text-[#c9a962] bg-[#111111] p-2 border border-[#333333]"
              >
                {code}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleCopy}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-semibold transition-colors',
              copied ? 'bg-green-600 text-white' : 'bg-[#333333] text-white hover:bg-[#444444]',
            )}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-[#333333] text-white hover:bg-[#444444] transition-colors"
          >
            Download
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-[#c9a962] text-[#0a0a0a] text-xs font-semibold hover:bg-[#d4b574] transition-colors"
        >
          I've Saved My Codes
        </button>
      </div>
    </div>
  );
}
