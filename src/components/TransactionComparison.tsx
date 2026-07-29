'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { TransactionStorage, type Transaction } from '@/lib/transaction-storage';

interface TransactionComparisonProps {
  className?: string;
}

export default function TransactionComparison({ className }: TransactionComparisonProps) {
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  const loadTransactions = () => {
    const txs = TransactionStorage.getAll();
    setAllTransactions(txs);
  };

  const toggleTransactionSelection = (tx: Transaction) => {
    setSelectedTransactions((prev) => {
      const isSelected = prev.some((t) => t.id === tx.id);
      if (isSelected) {
        return prev.filter((t) => t.id !== tx.id);
      } else if (prev.length < 5) {
        return [...prev, tx];
      }
      return prev;
    });
  };

  const exportComparison = () => {
    const report = generateComparisonReport();
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(report));
    element.setAttribute('download', 'transaction-comparison.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const generateComparisonReport = () => {
    let report = 'Transaction Comparison Report\n';
    report += '=' + '='.repeat(79) + '\n\n';

    selectedTransactions.forEach((tx, idx) => {
      report += `Transaction ${idx + 1}: ${tx.id}\n`;
      report += `-${'-'.repeat(78)}\n`;
      report += `Amount: ${tx.amount} ${tx.currency}\n`;
      report += `Status: ${tx.status}\n`;
      report += `Date: ${new Date(tx.timestamp).toLocaleString()}\n`;
      report += `Bridge Fee: ${tx.bridgeFee || 'N/A'}%\n`;
      report += `Payout Fee: ${tx.paycrestFee || 'N/A'}%\n`;
      report += `Total Fee: ${tx.totalFee || 'N/A'}%\n`;
      report += `Beneficiary: ${tx.beneficiary.accountName}\n`;
      report += `Institution: ${tx.beneficiary.institution}\n`;
      report += '\n';
    });

    report += '\nComparison Summary\n';
    report += '=' + '='.repeat(79) + '\n';
    report += `Total Transactions: ${selectedTransactions.length}\n`;
    report += `Total Amount: ${selectedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0).toFixed(2)}\n`;
    report += `Average Fee: ${(selectedTransactions.reduce((sum, tx) => sum + parseFloat(tx.totalFee || '0'), 0) / selectedTransactions.length).toFixed(2)}%\n`;

    return report;
  };

  const shareComparison = () => {
    const report = generateComparisonReport();
    if (navigator.share) {
      navigator.share({
        title: 'Transaction Comparison',
        text: report,
      });
    } else {
      alert('Sharing not supported on this device');
    }
  };

  const getHighlightedDifferences = () => {
    if (selectedTransactions.length < 2) return {};

    const differences: Record<string, boolean[]> = {};
    const fields = ['amount', 'bridgeFee', 'paycrestFee', 'totalFee', 'status'];

    fields.forEach((field) => {
      const values = selectedTransactions.map((tx) => {
        const val = tx[field as keyof Transaction];
        return String(val);
      });
      const allSame = values.every((v) => v === values[0]);
      if (!allSame) {
        differences[field] = values.map((v) => v !== values[0]);
      }
    });

    return differences;
  };

  const differences = getHighlightedDifferences();

  return (
    <div
      className={cn(
        'space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
    >
      <h2 className="text-lg font-semibold">Transaction Comparison Tool</h2>

      {/* Transaction Selection */}
      <div>
        <button
          onClick={loadTransactions}
          className="mb-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Load Transactions
        </button>

        {allTransactions.length > 0 && (
          <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-gray-300 p-3 dark:border-gray-600">
            {allTransactions.map((tx) => (
              <label
                key={tx.id}
                className="flex items-center gap-2 rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={selectedTransactions.some((t) => t.id === tx.id)}
                  onChange={() => toggleTransactionSelection(tx)}
                  disabled={
                    selectedTransactions.length >= 5 &&
                    !selectedTransactions.some((t) => t.id === tx.id)
                  }
                  className="h-4 w-4"
                />
                <div className="flex-1 text-sm">
                  <p className="font-medium">
                    {tx.amount} {tx.currency}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(tx.timestamp).toLocaleDateString()}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Selected: {selectedTransactions.length}/5
        </p>
      </div>

      {/* Comparison Table */}
      {selectedTransactions.length >= 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="px-3 py-2 text-left font-medium">Field</th>
                {selectedTransactions.map((tx, idx) => (
                  <th key={tx.id} className="px-3 py-2 text-left font-medium">
                    Tx {idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">Amount</td>
                {selectedTransactions.map((tx) => (
                  <td
                    key={tx.id}
                    className={cn(
                      'px-3 py-2',
                      differences['amount'] && 'bg-yellow-100 dark:bg-yellow-900',
                    )}
                  >
                    {tx.amount} {tx.currency}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">Status</td>
                {selectedTransactions.map((tx) => (
                  <td
                    key={tx.id}
                    className={cn(
                      'px-3 py-2',
                      differences['status'] && 'bg-yellow-100 dark:bg-yellow-900',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block rounded px-2 py-1 text-xs font-medium text-white',
                        tx.status === 'completed' && 'bg-green-500',
                        tx.status === 'pending' && 'bg-blue-500',
                        tx.status === 'failed' && 'bg-red-500',
                      )}
                    >
                      {tx.status}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">Bridge Fee</td>
                {selectedTransactions.map((tx) => (
                  <td
                    key={tx.id}
                    className={cn(
                      'px-3 py-2',
                      differences['bridgeFee'] && 'bg-yellow-100 dark:bg-yellow-900',
                    )}
                  >
                    {tx.bridgeFee || 'N/A'}%
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">Payout Fee</td>
                {selectedTransactions.map((tx) => (
                  <td
                    key={tx.id}
                    className={cn(
                      'px-3 py-2',
                      differences['paycrestFee'] && 'bg-yellow-100 dark:bg-yellow-900',
                    )}
                  >
                    {tx.paycrestFee || 'N/A'}%
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">Total Fee</td>
                {selectedTransactions.map((tx) => (
                  <td
                    key={tx.id}
                    className={cn(
                      'px-3 py-2',
                      differences['totalFee'] && 'bg-yellow-100 dark:bg-yellow-900',
                    )}
                  >
                    {tx.totalFee || 'N/A'}%
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">Date</td>
                {selectedTransactions.map((tx) => (
                  <td key={tx.id} className="px-3 py-2 text-xs">
                    {new Date(tx.timestamp).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Beneficiary</td>
                {selectedTransactions.map((tx) => (
                  <td key={tx.id} className="px-3 py-2 text-xs">
                    {tx.beneficiary.accountName}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Action Buttons */}
      {selectedTransactions.length >= 2 && (
        <div className="flex gap-2">
          <button
            onClick={exportComparison}
            className="flex-1 rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
          >
            Export Report
          </button>
          <button
            onClick={shareComparison}
            className="flex-1 rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
          >
            Share Comparison
          </button>
          <button
            onClick={() => setSelectedTransactions([])}
            className="flex-1 rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          >
            Clear Selection
          </button>
        </div>
      )}

      {selectedTransactions.length < 2 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select at least 2 transactions to compare
        </p>
      )}
    </div>
  );
}
