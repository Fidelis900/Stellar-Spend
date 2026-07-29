import { logger } from '@/lib/logger';
('use client');

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { Transaction } from '@/lib/transaction-storage';
import { exportCSV, exportPDF, exportJSON, exportXLSX, filterByDateRange } from '@/lib/export';

interface Props {
  transactions: Transaction[];
  walletAddress?: string;
}

export default function ExportControls({ transactions, walletAddress }: Props) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);

  const filtered = filterByDateRange(transactions, dateFrom, dateTo);
  const disabled = filtered.length === 0;

  const slug = walletAddress ? `${walletAddress.slice(0, 6)}_${walletAddress.slice(-4)}` : 'wallet';
  const dateTag = dateFrom || dateTo ? `_${dateFrom || 'start'}_to_${dateTo || 'end'}` : '';
  const basename = `stellar_spend_${slug}${dateTag}`;

  const inputCls = cn(
    'bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white',
    'focus:outline-none focus:border-[#c9a962] [color-scheme:dark]',
  );

  const handleExport = async (format: 'csv' | 'pdf' | 'json' | 'xlsx') => {
    try {
      setExporting(format);
      switch (format) {
        case 'csv':
          exportCSV(filtered, `${basename}.csv`);
          break;
        case 'pdf':
          exportPDF(filtered, basename);
          break;
        case 'json':
          exportJSON(filtered, `${basename}.json`);
          break;
        case 'xlsx':
          await exportXLSX(filtered, `${basename}.xlsx`);
          break;
      }
    } catch (error) {
      logger.error(`Export failed for ${format}:`, {}, error);
    } finally {
      setExporting(null);
    }
  };

  const buttonCls = (format: string) =>
    cn(
      'text-[10px] tracking-widest uppercase px-4 py-2 border transition-colors duration-150',
      'border-[#c9a962] text-[#c9a962]',
      !disabled && 'hover:bg-[#c9a962] hover:text-[#0a0a0a]',
      disabled && 'opacity-40 cursor-not-allowed',
      exporting === format && 'opacity-60',
    );

  return (
    <div className="border border-[#333333] bg-[#111111] p-4 flex flex-wrap items-center gap-3">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-[#777777] uppercase tracking-widest whitespace-nowrap">
          From
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Export date from"
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-[#777777] uppercase tracking-widest whitespace-nowrap">
          To
        </label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Export date to"
          className={inputCls}
        />
      </div>

      <span className="text-[10px] text-[#555555] whitespace-nowrap">
        {filtered.length} / {transactions.length} tx
      </span>

      {/* CSV */}
      <button
        onClick={() => handleExport('csv')}
        disabled={disabled || exporting !== null}
        aria-label="Export as CSV"
        className={buttonCls('csv')}
      >
        {exporting === 'csv' ? '⟳ CSV' : '↓ CSV'}
      </button>

      {/* JSON */}
      <button
        onClick={() => handleExport('json')}
        disabled={disabled || exporting !== null}
        aria-label="Export as JSON"
        className={buttonCls('json')}
      >
        {exporting === 'json' ? '⟳ JSON' : '↓ JSON'}
      </button>

      {/* XLSX */}
      <button
        onClick={() => handleExport('xlsx')}
        disabled={disabled || exporting !== null}
        aria-label="Export as Excel"
        className={buttonCls('xlsx')}
      >
        {exporting === 'xlsx' ? '⟳ XLSX' : '↓ XLSX'}
      </button>

      {/* PDF */}
      <button
        onClick={() => handleExport('pdf')}
        disabled={disabled || exporting !== null}
        aria-label="Export as PDF"
        className={cn(
          'text-[10px] tracking-widest uppercase px-4 py-2 border transition-colors duration-150',
          'border-[#777777] text-[#777777]',
          !disabled && 'hover:border-[#c9a962] hover:text-[#c9a962]',
          disabled && 'opacity-40 cursor-not-allowed',
          exporting === 'pdf' && 'opacity-60',
        )}
      >
        {exporting === 'pdf' ? '⟳ PDF' : '↓ PDF'}
      </button>
    </div>
  );
}
