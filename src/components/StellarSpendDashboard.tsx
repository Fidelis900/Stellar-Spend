'use client';

import { useState, useCallback, useRef, useMemo, useTransition } from 'react';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import FormCard, { type OfframpPayload, type QuoteResult } from '@/components/FormCard';
import RightPanel from '@/components/RightPanel';
import RecentOfframpsTable from '@/components/RecentOfframpsTable';
import ProgressSteps from '@/components/ProgressSteps';
import { TransactionProgressModal } from '@/components/TransactionProgressModal';
import { Header } from '@/components/Header';
import { TransactionStorage } from '@/lib/transaction-storage';
import { pollBridgeStatus, pollPayoutStatus } from '@/lib/offramp';
import type { OfframpStep } from '@shared/types/stellaramp';
import { useFunnelTracking } from '@/hooks/useFunnelTracking';
import { useStellarBalances } from '@/hooks/useStellarBalances';
import { useWalletTransactions } from '@/hooks/useWalletTransactions';
import React from 'react';

// Memoize sub-components for better performance
const MemoizedHeader = React.memo(Header);
const MemoizedProgressSteps = React.memo(ProgressSteps);
const MemoizedRecentOfframpsTable = React.memo(RecentOfframpsTable);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StellarSpendDashboard() {
  const { wallet, isConnected, isConnecting, connect, disconnect, signTransaction } =
    useStellarWallet();
  const { trackStep } = useFunnelTracking();
  const [isPending, startTransition] = useTransition();

  // Balances via focused hook
  const {
    usdc: usdcBalance,
    xlm: xlmBalance,
    isLoading: isBalanceLoading,
    refresh: refreshBalances,
  } = useStellarBalances(wallet?.publicKey);

  // Transaction history via focused hook
  const { transactions, reload: reloadTransactions } = useWalletTransactions(wallet?.publicKey);

  // Lifted form state (for RightPanel sync)
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  // Modal
  const [modalStep, setModalStep] = useState<OfframpStep>('idle');
  const [modalError, setModalError] = useState<string | undefined>(undefined);

  // Form reset key — increment to wipe FormCard fields
  const [formResetKey, setFormResetKey] = useState(0);

  // Abort ref for in-flight polling (allows cleanup on unmount / new trade)
  const abortRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Wallet handlers
  // ---------------------------------------------------------------------------
  const handleConnect = useCallback(async () => {
    try {
      await connect();
      trackStep('wallet_connect');
    } catch {
      // error surfaced via useStellarWallet.error
    }
  }, [connect, trackStep]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setAmount('');
    setCurrency('');
    setQuote(null);
    reloadTransactions();
  }, [disconnect, reloadTransactions]);

  // ---------------------------------------------------------------------------
  // Pre-flight balance check
  // ---------------------------------------------------------------------------
  const MIN_XLM_RESERVE = 3;
  const ESTIMATED_GAS = 2.5;

  const parseBalance = useCallback((raw: string | null): number => {
    if (!raw) return 0;
    return Number(raw.replace(/,/g, ''));
  }, []);

  const checkBalance = useCallback(
    (payload: OfframpPayload): string | null => {
      const usdc = parseBalance(usdcBalance);
      const needed = Number(payload.amount);

      if (!isNaN(needed) && needed > usdc) {
        return `Insufficient USDC balance. You have ${usdcBalance ?? '0'} USDC but are trying to send ${payload.amount} USDC.`;
      }

      if (payload.feeMethod === 'XLM') {
        const xlm = parseBalance(xlmBalance);
        const required = MIN_XLM_RESERVE + ESTIMATED_GAS;
        if (xlm < required) {
          return `Insufficient XLM for gas. You need at least ${required} XLM (Reserve + Gas) but have ${xlmBalance ?? '0'} XLM. Try switching to USDC fee payment.`;
        }
      }

      return null;
    },
    [usdcBalance, xlmBalance, parseBalance],
  );

  // ---------------------------------------------------------------------------
  // Polling logic memoized
  // ---------------------------------------------------------------------------
  const pollSorobanTx = useCallback(async (txHash: string): Promise<void> => {
    const maxAttempts = 30;
    const interval = 3000;
    let attempt = 0;

    while (attempt < maxAttempts) {
      if (abortRef.current) throw new Error('Polling cancelled');

      attempt++;
      const res = await fetch(`/api/offramp/bridge/tx-status/${txHash}`);
      const data = await res.json();
      const status = data.status ?? 'NOT_FOUND';

      if (status === 'SUCCESS') {
        return;
      }
      if (status === 'FAILED') {
        throw new Error('Transaction failed on-chain. Your wallet was not debited.');
      }
      if (status === 'NOT_FOUND') {
        await new Promise((resolve) => setTimeout(resolve, interval));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Transaction was not confirmed within 90s. It may have expired.');
  }, []);

  const pollBridge = useCallback(async (txHash: string, txId: string): Promise<void> => {
    await pollBridgeStatus(
      async () => {
        if (abortRef.current) return { status: 'failed' };
        const res = await fetch(`/api/offramp/bridge/status/${txHash}`);
        const data = await res.json();
        return { status: data.status ?? 'pending' };
      },
      ['completed', 'failed', 'expired'],
      {
        interval: 5000,
        timeout: 600_000,
        onProgress: () => {
          if (!abortRef.current) setModalStep('processing');
        },
      },
    );

    TransactionStorage.update(txId, { bridgeStatus: 'completed' });
  }, []);

  const pollPayout = useCallback(async (orderId: string, txId: string): Promise<void> => {
    setModalStep('settling');

    const result = await pollPayoutStatus(
      async () => {
        if (abortRef.current) return { status: 'expired' };
        const res = await fetch(`/api/offramp/status/${orderId}`);
        const data = await res.json();
        return { status: data.status ?? 'pending' };
      },
      ['settled', 'refunded', 'expired'],
      {
        interval: 10_000,
        timeout: 600_000,
      },
    );

    if (result.status === 'settled') {
      TransactionStorage.update(txId, {
        payoutStatus: 'settled',
        status: 'completed',
      });
    } else {
      TransactionStorage.update(txId, {
        payoutStatus: result.status,
        status: 'failed',
      });
      throw new Error(`Payout ended with status: ${result.status}`);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Main trade execution flow
  // ---------------------------------------------------------------------------
  const handleExecuteTrade = useCallback(
    async (payload: OfframpPayload) => {
      if (!wallet?.publicKey) return;

      // Pre-flight balance check
      const balanceError = checkBalance(payload);
      if (balanceError) {
        setModalError(balanceError);
        setModalStep('error');
        return;
      }

      abortRef.current = false;
      setModalError(undefined);
      setModalStep('initiating');
      trackStep('form_fill', {
        amount: payload.amount,
        currency: payload.currency,
      });

      // Create a pending transaction record
      const txId = TransactionStorage.generateId();
      const txRecord: Transaction = {
        id: txId,
        timestamp: Date.now(),
        userAddress: wallet.publicKey,
        amount: payload.amount,
        currency: payload.currency,
        status: 'pending',
        beneficiary: {
          institution: payload.institution,
          accountIdentifier: payload.accountIdentifier,
          accountName: payload.accountName,
          currency: payload.currency,
        },
      };
      TransactionStorage.save(txRecord);

      try {
        // Step 1 — build bridge transaction XDR
        setModalStep('awaiting-signature');
        const buildRes = await fetch('/api/offramp/bridge/build-tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: payload.amount,
            fromAddress: wallet.publicKey,
            feeMethod: payload.feeMethod,
            quote: payload.quote,
          }),
        });
        const buildData = await buildRes.json();
        if (!buildRes.ok) throw new Error(buildData.error ?? 'Failed to build transaction');

        const { xdr, toAddress } = buildData as {
          xdr: string;
          toAddress: string;
        };

        // Step 2 — sign transaction (wallet prompt)
        trackStep('quote_received');
        trackStep('signature_requested');
        const signedXdr = await signTransaction(xdr);

        // Step 3 — submit to network
        setModalStep('submitting');
        const submitRes = await fetch('/api/offramp/bridge/submit-soroban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signedXdr }),
        });
        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData.error ?? 'Failed to submit transaction');

        const { status: submitStatus, hash: txHash } = submitData as {
          status: string;
          hash: string;
        };
        TransactionStorage.update(txId, { stellarTxHash: txHash });
        trackStep('tx_submitted', { txHash });

        // If PENDING, poll until SUCCESS/FAILED
        if (submitStatus === 'PENDING') {
          await pollSorobanTx(txHash);
        }

        // Step 4 — poll bridge status
        setModalStep('processing');
        trackStep('bridge_processing');
        await pollBridge(txHash, txId);

        // Step 5 — execute payout
        const payoutRes = await fetch('/api/offramp/execute-payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.publicKey,
            amount: payload.amount,
            currency: payload.currency,
            feeMethod: payload.feeMethod,
            receiveAmount: payload.quote?.destinationAmount,
            beneficiary: {
              institution: payload.institution,
              accountIdentifier: payload.accountIdentifier,
              accountName: payload.accountName,
              currency: payload.currency,
            },
            toAddress,
            txHash,
          }),
        });
        const payoutData = await payoutRes.json();
        if (!payoutRes.ok) throw new Error(payoutData.error ?? 'Failed to execute payout');

        const { orderId } = payoutData as { orderId: string };
        TransactionStorage.update(txId, { payoutOrderId: orderId });

        // Step 6 — poll payout status
        trackStep('payout_settling', { orderId });
        await pollPayout(orderId, txId);

        // Success
        setModalStep('success');
        trackStep('completed', {
          amount: payload.amount,
          currency: payload.currency,
        });
        setFormResetKey((k: number) => k + 1);

        // Refresh balances and history
        await refreshBalances();
        reloadTransactions();
      } catch (err: unknown) {
        if (abortRef.current) return; // user navigated away
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        TransactionStorage.update(txId, { status: 'failed', error: msg });
        reloadTransactions();
        setModalError(msg);
        setModalStep('error');
      }
    },
    [
      wallet?.publicKey,
      checkBalance,
      pollSorobanTx,
      pollBridge,
      pollPayout,
      signTransaction,
      trackStep,
    ],
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Memoized values for children
  // ---------------------------------------------------------------------------
  const balanceData = useMemo(
    () => ({
      usdc: usdcBalance,
      xlm: xlmBalance,
      isLoading: isBalanceLoading,
    }),
    [usdcBalance, xlmBalance, isBalanceLoading],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen p-4 bg-[#0a0a0a]">
      <TransactionProgressModal
        step={modalStep}
        errorMessage={modalError}
        onClose={() => {
          setModalStep('idle');
          setModalError(undefined);
        }}
      />

      <MemoizedHeader
        subtitle="Offramp Dashboard"
        isConnected={isConnected}
        isConnecting={isConnecting}
        walletAddress={wallet?.publicKey}
        walletType={
          wallet?.type === 'freighter' ? 'Freighter' : wallet?.type === 'lobstr' ? 'Lobstr' : null
        }
        stellarUsdcBalance={balanceData.usdc}
        stellarXlmBalance={balanceData.xlm}
        isBalanceLoading={balanceData.isLoading}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <section className="border border-[#333333] px-4 py-6 sm:px-8 sm:py-8 overflow-hidden mt-6">
        <div className="grid grid-cols-1 min-[1100px]:grid-cols-[1fr_370px] gap-6 w-full">
          {/* Left: form */}
          <div data-testid="FormCard">
            <FormCard
              isConnected={isConnected}
              isConnecting={isConnecting}
              resetKey={formResetKey}
              onConnect={handleConnect}
              onSubmit={handleExecuteTrade}
              onQuoteChange={setQuote}
              onAmountChange={setAmount}
              onCurrencyChange={setCurrency}
            />
          </div>

          {/* Right: payout preview */}
          <div
            data-testid="RightPanel"
            className="min-[1100px]:col-start-2 min-[1100px]:row-start-1 min-[1100px]:row-span-2"
          >
            <RightPanel
              isConnected={isConnected}
              isConnecting={isConnecting}
              amount={amount}
              quote={quote}
              isLoadingQuote={false}
              currency={currency}
              onConnect={handleConnect}
            />
          </div>

          {/* Recent offramps */}
          <div>
            <MemoizedRecentOfframpsTable />
          </div>

          {/* Progress steps */}
          <div className="min-[1100px]:col-span-2 mt-4">
            <MemoizedProgressSteps isConnected={isConnected} isConnecting={isConnecting} />
          </div>
        </div>
      </section>
    </main>
  );
}
