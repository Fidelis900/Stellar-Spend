'use client';

import { useState, useCallback } from 'react';
import { useWebVitals } from '@/hooks/useWebVitals';
import Header from './Header';
import FormCard, { type OfframpPayload, type QuoteResult } from './FormCard';
import RightPanel from './RightPanel';

/**
 * DashboardClient - Client Component
 * Handles wallet state and interactive form logic
 * Separated to allow server-rendered static content in main page
 */

export default function DashboardClient() {
  // Track Web Vitals
  useWebVitals();

  // Wallet state (mock for now - integrate with Freighter/Lobstr)
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>();
  const [resetKey, setResetKey] = useState(0);

  // Shared state for FormCard <-> RightPanel sync
  const [currentQuote, setCurrentQuote] = useState<QuoteResult | null>(null);
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentCurrency, setCurrentCurrency] = useState('');

  const handleConnect = useCallback(() => {
    setIsConnecting(true);
    // Mock wallet connection
    setTimeout(() => {
      setIsConnected(true);
      setWalletAddress('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
      setIsConnecting(false);
    }, 1000);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setWalletAddress(undefined);
    setResetKey((prev) => prev + 1);
  }, []);

  const handleSubmit = useCallback(async (payload: OfframpPayload) => {
    // Implement actual submission logic
    await new Promise((resolve) => setTimeout(resolve, 2000));
    alert('Offramp initiated successfully!');
  }, []);

  return (
    <>
      <Header
        subtitle="Off-Ramp USDC/USDT to Fiat"
        isConnected={isConnected}
        isConnecting={isConnecting}
        walletAddress={walletAddress}
        stellarUsdcBalance={isConnected ? '1,234.56' : null}
        stellarXlmBalance={isConnected ? '567.89' : null}
        isBalanceLoading={false}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <FormCard
          isConnected={isConnected}
          isConnecting={isConnecting}
          resetKey={resetKey}
          onConnect={handleConnect}
          onSubmit={handleSubmit}
          onQuoteChange={setCurrentQuote}
          onAmountChange={setCurrentAmount}
          onCurrencyChange={setCurrentCurrency}
        />
        <RightPanel
          quote={currentQuote}
          amount={currentAmount}
          currency={currentCurrency}
        />
      </section>
    </>
  );
}
