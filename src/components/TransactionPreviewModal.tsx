'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useFocusTrap, useFocusRestore } from '@/hooks/useFocusTrap';

export interface TransactionPreviewData {
  amount: string;
  currency: string;
  destinationAmount: string;
  rate: number;
  bridgeFee: string;
  payoutFee: string;
  totalFee: string;
  feeMethod: 'native' | 'stablecoin';
  accountName: string;
  accountNumber: string;
  bankName: string;
  estimatedTime: number;
}

interface TransactionPreviewModalProps {
  isOpen: boolean;
  data: TransactionPreviewData | null;
  isLoading?: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

export function TransactionPreviewModal({
  isOpen,
  data,
  isLoading = false,
  onConfirm,
  onEdit,
  onCancel,
}: TransactionPreviewModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);
  useFocusRestore(isOpen);

  // ESC calls onCancel (consistent with the Cancel button action)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading && !confirmed) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isLoading, confirmed, onCancel]);

  if (!isOpen || !data) return null;

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      aria-hidden="true"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 id="preview-title" className="text-xl font-bold text-gray-900 dark:text-white">
            Transaction Preview
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Review all details before confirming
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Amount Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Amount</h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-gray-400">You send</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {data.amount} USDC
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Recipient receives</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {data.destinationAmount} {data.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Exchange Rate */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Exchange Rate
            </h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">1 USDC</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {data.rate} {data.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Fee Breakdown
            </h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400">Bridge fee</span>
                <span className="text-gray-900 dark:text-white">{data.bridgeFee} USDC</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400">Payout fee</span>
                <span className="text-gray-900 dark:text-white">{data.payoutFee} USDC</span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2 flex justify-between items-center">
                <span className="font-semibold text-gray-900 dark:text-white">Total fees</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {data.totalFee} USDC
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Paid via {data.feeMethod === 'native' ? 'XLM' : 'USDC'}
              </div>
            </div>
          </div>

          {/* Recipient Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recipient</h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Name</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {data.accountName}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Account Number</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {data.accountNumber}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Bank</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{data.bankName}</p>
              </div>
            </div>
          </div>

          {/* Estimated Time */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <span className="font-semibold">Estimated time:</span> {data.estimatedTime} seconds
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading || confirmed}
            className={cn(
              'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
              'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white',
              'hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            aria-label="Cancel transaction"
          >
            Cancel
          </button>
          <button
            onClick={onEdit}
            disabled={isLoading || confirmed}
            className={cn(
              'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
              'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white',
              'hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            aria-label="Edit transaction details"
          >
            Edit
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || confirmed}
            className={cn(
              'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
              'bg-blue-600 text-white hover:bg-blue-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            aria-label="Confirm transaction"
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
