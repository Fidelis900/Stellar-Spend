/**
 * Service interfaces for dependency injection
 * Each interface mirrors the public API of its corresponding service class.
 */

import type { PayoutStatus as CanonicalPayoutStatus } from '@/lib/transaction-status';

export interface IQuoteService {
  getQuote(request: {
    amount: string;
    currency: string;
    feeMethod: 'USDC' | 'XLM' | 'stablecoin' | 'native';
  }): Promise<{
    destinationAmount: string;
    rate: number;
    currency: string;
    bridgeFee: string;
    payoutFee: string;
    estimatedTime: number;
  }>;
}

export interface IBridgeService {
  buildTransaction(request: {
    amount: string;
    fromAddress: string;
    toAddress: string;
    feePaymentMethod?: 'native' | 'stablecoin';
  }): Promise<{
    xdr: string;
    sourceToken: { symbol: string; decimals: number; contract?: string; chain: string };
    destinationToken: { symbol: string; decimals: number; contract?: string; chain: string };
  }>;
  submitTransaction(request: {
    xdr: string;
    signature: string;
  }): Promise<{ txHash: string; status: string }>;
  getTransactionStatus(txHash: string): Promise<{ status: string; bridgeAmount?: string }>;
}

export interface IPayoutService {
  createOrder(params: CreateOrderParams): Promise<PayoutOrder>;
  getStatus(orderId: string): Promise<PayoutStatusInfo>;
  executePayout(orderId: string, amount: string): Promise<ExecutePayoutResult>;
}

export interface IWalletService {
  connect(walletType: string): Promise<WalletConnection>;
  disconnect(): Promise<void>;
  signTransaction(xdr: string): Promise<string>;
  getBalance(address: string): Promise<string>;
}

// ── Type Definitions ──────────────────────────────────────────────────────

export interface QuoteResult {
  destinationAmount: string;
  rate: number;
  currency: string;
  bridgeFee: string;
  payoutFee: string;
  estimatedTime: number;
}

export interface BuildTxParams {
  amount: string;
  fromAddress: string;
  toAddress: string;
  feePaymentMethod: 'stablecoin' | 'native';
}

export interface BuildTxResult {
  xdr: string;
  sourceToken: TokenInfo;
  destinationToken: TokenInfo;
}

export interface TokenInfo {
  symbol: string;
  decimals: number;
  chain: string;
}

export interface SubmitTxResult {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface BridgeStatus {
  status: 'pending' | 'completed' | 'failed';
  progress: number;
  estimatedTime: number;
}

export interface GasFeeOption {
  method: 'stablecoin' | 'native';
  amount: string;
  symbol: string;
}

export interface CreateOrderParams {
  amount: string;
  currency: string;
  beneficiary: BeneficiaryInfo;
}

export interface BeneficiaryInfo {
  accountNumber: string;
  bankCode: string;
  name: string;
}

export interface PayoutOrder {
  orderId: string;
  status: CanonicalPayoutStatus;
  amount: string;
  currency: string;
}

export interface PayoutStatusInfo {
  orderId: string;
  status: CanonicalPayoutStatus;
  progress: number;
  estimatedTime: number;
}

/** @deprecated Use PayoutStatusInfo */
export type PayoutStatus = PayoutStatusInfo;

export interface ExecutePayoutResult {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface WalletConnection {
  address: string;
  walletType: string;
  isConnected: boolean;
}
