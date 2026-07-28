export interface TransactionAnalytics {
  totalTransactions: number;
  totalVolume: string;
  averageAmount: string;
  successRate: number;
  failureRate: number;
  pendingCount: number;
}

export interface CurrencyBreakdown {
  currency: string;
  count: number;
  volume: string;
  percentage: number;
}

export interface FeeAnalysis {
  totalFeesPaid: string;
  averageFeePercentage: number;
  bridgeFees: string;
  payoutFees: string;
}

export interface SpendingPattern {
  date: string;
  amount: string;
  transactionCount: number;
  currency: string;
}

export interface AnalyticsPeriod {
  startDate: number;
  endDate: number;
  analytics: TransactionAnalytics;
  currencyBreakdown: CurrencyBreakdown[];
  feeAnalysis: FeeAnalysis;
  spendingPatterns: SpendingPattern[];
  /** Conversion funnel data (#399) */
  funnel?: import('@/lib/funnel').FunnelData;
}

export interface AnalyticsReport {
  period: AnalyticsPeriod;
  generatedAt: number;
  userAddress: string;
}
