'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/cn';
import { useStellarWallet } from '@/hooks/useStellarWallet';

interface Balance {
  asset: string;
  balance: string;
  issuer?: string;
}

interface WalletBalanceDisplayProps {
  className?: string;
  showHistory?: boolean;
}

export default function WalletBalanceDisplay({
  className,
  showHistory = false,
}: WalletBalanceDisplayProps) {
  const { wallet } = useStellarWallet();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [balanceHistory, setBalanceHistory] = useState<
    Array<{ timestamp: number; balances: Balance[] }>
  >([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!wallet?.publicKey) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`https://horizon.stellar.org/accounts/${wallet.publicKey}`);

      if (!response.ok) {
        throw new Error('Failed to fetch account balances');
      }

      const data = await response.json();
      const newBalances: Balance[] = data.balances.map(
        (balance: {
          balance: string;
          asset_type: string;
          asset_code?: string;
          asset_issuer?: string;
        }) => ({
          asset: balance.asset_type === 'native' ? 'XLM' : balance.asset_code || 'Unknown',
          balance: balance.balance,
          issuer: balance.asset_issuer,
        }),
      );

      setBalances(newBalances);

      // Track history
      if (showHistory) {
        setBalanceHistory((prev) =>
          [...prev, { timestamp: Date.now(), balances: newBalances }].slice(-24),
        ); // Keep last 24 entries
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balances');
    } finally {
      setLoading(false);
    }
  }, [wallet?.publicKey, showHistory]);

  useEffect(() => {
    fetchBalances();
  }, [wallet?.publicKey, fetchBalances]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchBalances, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchBalances]);

  const usdcBalance = balances.find((b) => b.asset === 'USDC');
  const xlmBalance = balances.find((b) => b.asset === 'XLM');

  const getBalanceChange = (asset: string) => {
    if (balanceHistory.length < 2) return null;

    const current = balances.find((b) => b.asset === asset);
    const previous = balanceHistory[balanceHistory.length - 2].balances.find(
      (b) => b.asset === asset,
    );

    if (!current || !previous) return null;

    const change = parseFloat(current.balance) - parseFloat(previous.balance);
    return change;
  };

  if (!wallet) {
    return (
      <div
        className={cn(
          'rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900',
          className,
        )}
      >
        <p className="text-center text-gray-600 dark:text-gray-400">
          Connect your wallet to view balances
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Wallet Balances</h2>
        <div className="flex gap-2">
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
            aria-label="Refresh balances"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4"
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Main Balances */}
      <div className="space-y-3">
        {/* USDC Balance */}
        {usdcBalance && (
          <div className="rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 p-4 dark:from-blue-900 dark:to-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">USDC Balance</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {parseFloat(usdcBalance.balance).toFixed(2)}
                </p>
              </div>
              {showHistory && getBalanceChange('USDC') !== null && (
                <div
                  className={cn(
                    'text-right',
                    getBalanceChange('USDC')! > 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  <p className="text-sm font-medium">
                    {getBalanceChange('USDC')! > 0 ? '+' : ''}
                    {getBalanceChange('USDC')!.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* XLM Balance */}
        {xlmBalance && (
          <div className="rounded-lg bg-gradient-to-r from-yellow-50 to-yellow-100 p-4 dark:from-yellow-900 dark:to-yellow-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">XLM Balance</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {parseFloat(xlmBalance.balance).toFixed(2)}
                </p>
              </div>
              {showHistory && getBalanceChange('XLM') !== null && (
                <div
                  className={cn(
                    'text-right',
                    getBalanceChange('XLM')! > 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  <p className="text-sm font-medium">
                    {getBalanceChange('XLM')! > 0 ? '+' : ''}
                    {getBalanceChange('XLM')!.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Other Assets */}
      {balances.length > 2 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Other Assets</p>
          <div className="space-y-2">
            {balances
              .filter((b) => b.asset !== 'USDC' && b.asset !== 'XLM')
              .map((balance) => (
                <div
                  key={balance.asset}
                  className="flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div>
                    <p className="font-medium">{balance.asset}</p>
                    {balance.issuer && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {balance.issuer.slice(0, 10)}...
                      </p>
                    )}
                  </div>
                  <p className="font-semibold">{parseFloat(balance.balance).toFixed(2)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Balance History Chart */}
      {showHistory && balanceHistory.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Balance History
          </p>
          <div className="space-y-2">
            <div className="flex gap-2">
              {['USDC', 'XLM'].map((asset) => (
                <button
                  key={asset}
                  onClick={() => setSelectedCurrency(selectedCurrency === asset ? null : asset)}
                  className={cn(
                    'rounded px-3 py-1 text-sm font-medium transition-colors',
                    selectedCurrency === asset
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                  )}
                >
                  {asset}
                </button>
              ))}
            </div>

            {selectedCurrency && (
              <div className="h-32 rounded border border-gray-300 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {balanceHistory.length} data points
                </p>
                <div className="mt-2 flex items-end gap-1">
                  {balanceHistory.map((entry, idx) => {
                    const balance = entry.balances.find((b) => b.asset === selectedCurrency);
                    const maxBalance = Math.max(
                      ...balanceHistory.map(
                        (e) =>
                          parseFloat(
                            e.balances.find((b) => b.asset === selectedCurrency)?.balance || '0',
                          ) || 0,
                      ),
                    );
                    const height = maxBalance
                      ? (parseFloat(balance?.balance || '0') / maxBalance) * 100
                      : 0;

                    return (
                      <div
                        key={idx}
                        className="flex-1 rounded-t bg-blue-500"
                        style={{ height: `${Math.max(height, 5)}%` }}
                        title={`${balance?.balance || '0'}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wallet Address */}
      <div className="rounded bg-gray-50 p-3 text-xs dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-400">Wallet Address</p>
        <p className="break-all font-mono text-gray-700 dark:text-gray-300">{wallet.publicKey}</p>
      </div>
    </div>
  );
}
