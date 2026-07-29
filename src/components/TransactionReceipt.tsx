'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { formatDate, formatNumber } from '@/lib/i18n/format';
import { qrCodeService } from '@/lib/services/qrcode-service';
import { QRCodeDisplay } from './QRCodeDisplay';

export interface ReceiptData {
  txHash: string;
  orderId?: string;
  amount: string;
  currency: string;
  destinationAmount: string;
  bridgeFee: string;
  payoutFee: string;
  rate: number;
  provider: string;
  bankName: string;
  accountNumber: string;
  timestamp: number;
  status: 'completed' | 'pending' | 'failed';
}

interface TransactionReceiptProps {
  data: ReceiptData;
  onClose?: () => void;
}

function explorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/public/tx/${txHash}`;
}

/** Compact, real QR rendering of the verification payload (tx id, amount, currency, status). */
function VerificationQR({ value, label }: { value: string; label: string }) {
  const svgPattern = qrCodeService.generateSVGPattern(value, 72);
  return (
    <div
      aria-label={label}
      role="img"
      style={{ width: 72, height: 72, background: '#fff', border: '1px solid var(--line)' }}
      dangerouslySetInnerHTML={{ __html: svgPattern }}
    />
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--text)',
          textAlign: 'right',
          wordBreak: 'break-all',
          fontFamily: mono ? 'var(--font-ibm-plex-mono)' : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  );
}

const STATUS_COLOR: Record<ReceiptData['status'], string> = {
  completed: '#22c55e',
  pending: 'var(--accent)',
  failed: '#ef4444',
};

const PRINT_STYLESHEET = `
  body { font-family: monospace; font-size: 12px; padding: 24px; color: #000; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #ddd; }
  .label { color: #666; }
  h2 { font-size: 16px; margin-bottom: 4px; }
  .amount { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
  .explorer-link { font-size: 11px; color: #1d4ed8; word-break: break-all; }
  .hash { margin-top: 16px; padding: 8px 10px; background: #f5f5f5; font-size: 10px; word-break: break-all; }
  @media print {
    body { padding: 0; }
    a { color: #000 !important; text-decoration: underline; }
  }
`;

export function TransactionReceipt({ data, onClose }: TransactionReceiptProps) {
  const { t, language } = useI18n();
  const [showFullQr, setShowFullQr] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const printableRef = useRef<HTMLDivElement>(null);

  const date = formatDate(data.timestamp, language);
  const shortHash = `${data.txHash.slice(0, 8)}…${data.txHash.slice(-6)}`;
  const shareText = `Stellar-Spend transaction ${shortHash} — ${data.amount} USDC → ${data.destinationAmount} ${data.currency}`;

  const qrPayload = qrCodeService.generateQRData({
    transactionId: data.txHash,
    amount: data.amount,
    currency: data.currency,
    timestamp: data.timestamp,
    status: data.status,
  });

  function handlePrint() {
    if (!printableRef.current) return;
    const win = window.open('', '_blank', 'width=480,height=700');
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt ${shortHash}</title>
      <style>${PRINT_STYLESHEET}</style></head><body>
      ${printableRef.current.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Transaction Receipt', text: shareText });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      alert('Receipt details copied to clipboard.');
    }
  }

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        padding: 24,
        maxWidth: 480,
        width: '100%',
      }}
    >
      <div ref={printableRef}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              {t('receipt.title').toUpperCase()}
            </div>
            <div style={{ fontSize: 20, color: 'var(--text)', fontWeight: 600 }}>
              {data.amount} USDC
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              → {formatNumber(parseFloat(data.destinationAmount), language)} {data.currency}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                border: '1px solid',
                borderColor: STATUS_COLOR[data.status],
                color: STATUS_COLOR[data.status],
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {data.status}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close receipt"
                style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Details */}
        <div ref={receiptRef}>
          <Row label={t('receipt.date')} value={date} />
          <Row label={t('receipt.txHash')} value={shortHash} mono />
          {data.orderId && <Row label={t('receipt.orderId')} value={data.orderId} mono />}
          <Row label={t('receipt.provider')} value={data.provider} />
          <Row
            label={t('receipt.exchangeRate')}
            value={`1 USDC = ${formatNumber(data.rate, language)} ${data.currency}`}
          />
          <Row label={t('receipt.bridgeFee')} value={`${data.bridgeFee} USDC`} />
          <Row label={t('receipt.payoutFee')} value={`${data.payoutFee} USDC`} />
          <Row label={t('receipt.bank')} value={data.bankName} />
          <Row label={t('receipt.account')} value={`****${data.accountNumber.slice(-4)}`} mono />
        </div>

        <a
          href={explorerUrl(data.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="explorer-link"
          style={{ display: 'block', fontSize: 11, color: 'var(--accent)', marginTop: 12 }}
        >
          {t('receipt.viewExplorer')} ↗
        </a>

        {/* Full hash */}
        <div
          className="hash"
          style={{
            marginTop: 12,
            padding: '8px 10px',
            background: 'var(--bg)',
            fontSize: 10,
            color: 'var(--muted)',
            wordBreak: 'break-all',
            fontFamily: 'var(--font-ibm-plex-mono)',
          }}
        >
          {data.txHash}
        </div>
      </div>

      {/* QR + Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: 20,
        }}
      >
        <VerificationQR
          value={qrPayload}
          label={`QR code for transaction ${data.txHash.slice(0, 8)}…`}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowFullQr((v) => !v)}
            style={{
              fontSize: 12,
              padding: '8px 14px',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {showFullQr ? t('receipt.hideQr') : t('receipt.showQr')}
          </button>
          <button
            onClick={handlePrint}
            style={{
              fontSize: 12,
              padding: '8px 14px',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {t('receipt.print')}
          </button>
          <button
            onClick={handleShare}
            style={{
              fontSize: 12,
              padding: '8px 14px',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {t('receipt.share')}
          </button>
        </div>
      </div>

      {showFullQr && (
        <div style={{ marginTop: 20 }}>
          <QRCodeDisplay
            data={{
              transactionId: data.txHash,
              amount: data.amount,
              currency: data.currency,
              timestamp: data.timestamp,
              status: data.status,
            }}
            size={160}
          />
        </div>
      )}
    </div>
  );
}
