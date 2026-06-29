/**
 * Stellar DEX stablecoin swap service.
 * Uses Stellar path payment strict send to swap USDC <-> USDT before off-ramp.
 */

import { Asset, TransactionBuilder, Operation, Networks, Account } from '@stellar/stellar-sdk';

export interface StellarSwapQuote {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  price: number;
  priceImpact: number;
  slippageTolerance: number;
  /** Minimum received after slippage (toAmount * (1 - slippage)) */
  minAmountOut: string;
  /** Fee as a fraction (e.g. 0.003 = 0.3%) */
  fee: number;
  route: string[];
  expiresAt: number;
}

/** Mainnet issuers */
const STELLAR_ASSET_ISSUERS: Record<string, string> = {
  USDC: process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  USDT: 'GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BROAQIAPW53XBRJVN6ZJVTG6I',
};

const SWAP_FEE = 0.003; // 0.3% DEX fee
const QUOTE_TTL_MS = 30_000; // 30 seconds
const DEFAULT_SLIPPAGE = 0.005; // 0.5%
const MAX_SLIPPAGE = 0.05; // 5%

export function getAssetForSymbol(symbol: string): Asset {
  const upper = symbol.toUpperCase();
  if (upper === 'XLM') return Asset.native();
  const issuer = STELLAR_ASSET_ISSUERS[upper];
  if (!issuer) throw new Error(`Unknown Stellar asset: ${symbol}`);
  return new Asset(upper, issuer);
}

export function calculateMinAmountOut(amount: string, slippageTolerance: number): string {
  const tol = Math.min(Math.max(slippageTolerance, 0), MAX_SLIPPAGE);
  const result = parseFloat(amount) * (1 - tol);
  if (isNaN(result) || result <= 0) return '0';
  return result.toFixed(7);
}

export class StellarSwapService {
  /**
   * Get a DEX swap quote. For USDC<->USDT the price is approximately 1:1
   * with a small DEX spread. In production this would call the Stellar
   * Horizon path-find endpoint; here we model the on-chain AMM.
   */
  async getQuote(
    fromSymbol: string,
    toSymbol: string,
    amount: string,
    slippageTolerance = DEFAULT_SLIPPAGE,
  ): Promise<StellarSwapQuote> {
    const from = fromSymbol.toUpperCase();
    const to = toSymbol.toUpperCase();

    if (!STELLAR_ASSET_ISSUERS[from]) throw new Error(`Unsupported swap asset: ${from}`);
    if (!STELLAR_ASSET_ISSUERS[to]) throw new Error(`Unsupported swap asset: ${to}`);
    if (from === to) throw new Error('Cannot swap the same asset');

    const fromAmt = parseFloat(amount);
    if (isNaN(fromAmt) || fromAmt <= 0) throw new Error('Amount must be a positive number');

    const tol = Math.min(Math.max(slippageTolerance, 0), MAX_SLIPPAGE);

    // USDC/USDT are pegged ~1:1; model a small 0.1% AMM spread
    const spread = 0.001;
    const price = 1 - spread;
    const toAmt = fromAmt * price * (1 - SWAP_FEE);
    const priceImpact = fromAmt > 10000 ? 0.002 : 0.0005; // simplified

    return {
      fromSymbol: from,
      toSymbol: to,
      fromAmount: amount,
      toAmount: toAmt.toFixed(7),
      price,
      priceImpact,
      slippageTolerance: tol,
      minAmountOut: calculateMinAmountOut(toAmt.toFixed(7), tol),
      fee: SWAP_FEE,
      route: [from, to],
      expiresAt: Date.now() + QUOTE_TTL_MS,
    };
  }

  /** Throws if the actual received amount is below the slippage-protected minimum. */
  validateSlippage(quote: StellarSwapQuote, actualAmount: string): void {
    const actual = parseFloat(actualAmount);
    const min = parseFloat(quote.minAmountOut);
    if (actual < min) {
      throw new Error(
        `Slippage exceeded: received ${actualAmount} but minimum was ${quote.minAmountOut}`,
      );
    }
  }

  isQuoteExpired(quote: StellarSwapQuote): boolean {
    return Date.now() > quote.expiresAt;
  }

  /**
   * Build a Stellar path payment strict-send XDR for the swap.
   * The caller must sign and submit the returned XDR.
   */
  async buildSwapTransaction(
    quote: StellarSwapQuote,
    userAddress: string,
    sequenceNumber = '0',
  ): Promise<string> {
    if (this.isQuoteExpired(quote)) throw new Error('Quote has expired');

    const sendAsset = getAssetForSymbol(quote.fromSymbol);
    const destAsset = getAssetForSymbol(quote.toSymbol);

    const account = new Account(userAddress, sequenceNumber);
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount: quote.fromAmount,
          destination: userAddress,
          destAsset,
          destMin: quote.minAmountOut,
          path: [],
        }),
      )
      .setTimeout(180)
      .build();

    return tx.toXDR();
  }
}

export const stellarSwapService = new StellarSwapService();
