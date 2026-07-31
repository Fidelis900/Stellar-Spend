'use client';

import { SharePreview } from '@shared/types/sharing';

interface SharePreviewProps {
  preview: SharePreview;
}

export function SharePreview({ preview }: SharePreviewProps) {
  const statusColors: Record<string, string> = {
    completed: 'text-green-600',
    pending: 'text-yellow-600',
    failed: 'text-red-600',
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">Transaction Amount</p>
          <p className="text-3xl font-bold">
            {preview.amount} <span className="text-lg">{preview.currency}</span>
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Status</p>
          <p
            className={`font-semibold capitalize ${statusColors[preview.status] || 'text-gray-600'}`}
          >
            {preview.status}
          </p>
        </div>

        <div className="text-xs text-gray-500">{new Date(preview.timestamp).toLocaleString()}</div>

        <div className="pt-4 border-t border-blue-200">
          <p className="text-xs text-gray-600">Powered by Stellar-Spend</p>
        </div>
      </div>
    </div>
  );
}
