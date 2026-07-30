import { logger } from '@/lib/logger';
('use client');

import { useState, useRef } from 'react';
import { QRCodeData } from '@/types/qrcode';
import { qrCodeService } from '@/lib/services';

interface QRCodeDisplayProps {
  data: QRCodeData;
  size?: number;
  showDownload?: boolean;
}

export function QRCodeDisplay({ data, size = 200, showDownload = true }: QRCodeDisplayProps) {
  const [format, setFormat] = useState<'svg' | 'png'>('svg');
  const svgRef = useRef<HTMLDivElement>(null);

  const qrData = qrCodeService.generateQRData(data);
  const svgPattern = qrCodeService.generateSVGPattern(qrData, size);

  const handleDownload = async () => {
    try {
      const svg = svgPattern;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transaction-${data.transactionId}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error downloading QR code:', {}, error);
    }
  };

  const handleScan = () => {
    // TODO: Implement QR scanning functionality
    // Could use a library like jsQR or html5-qrcode
    alert('QR scanning feature coming soon!');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Transaction QR Code</h3>
        {showDownload && (
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Download
          </button>
        )}
      </div>

      {/* QR Code Display */}
      <div className="flex justify-center p-4 bg-white border rounded-lg">
        <div
          ref={svgRef}
          dangerouslySetInnerHTML={{ __html: svgPattern }}
          style={{ width: size, height: size }}
        />
      </div>

      {/* Transaction Details */}
      <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Amount</span>
          <span className="font-semibold">
            {data.amount} {data.currency}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Status</span>
          <span className="font-semibold capitalize">{data.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Date</span>
          <span className="font-semibold">{new Date(data.timestamp).toLocaleDateString()}</span>
        </div>
        {data.bankName && (
          <div className="flex justify-between">
            <span className="text-gray-600">Bank</span>
            <span className="font-semibold">{data.bankName}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleScan}
          className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          Scan QR
        </button>
        <button
          onClick={() => {
            const qrData = qrCodeService.generateQRData(data);
            navigator.clipboard.writeText(qrData);
            alert('QR data copied to clipboard');
          }}
          className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          Copy Data
        </button>
      </div>
    </div>
  );
}
