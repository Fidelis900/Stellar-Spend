import {
  TransactionAnalytics,
  CurrencyBreakdown,
  FeeAnalysis,
  SpendingPattern,
  AnalyticsPeriod,
} from '@shared/types/analytics';

export class AnalyticsService {
  async getAnalytics(
    userAddress: string,
    startDate: number,
    endDate: number,
  ): Promise<AnalyticsPeriod> {
    // TODO: Fetch transactions from database
    const transactions: any[] = [];

    const analytics = this.calculateAnalytics(transactions);
    const currencyBreakdown = this.calculateCurrencyBreakdown(transactions);
    const feeAnalysis = this.calculateFeeAnalysis(transactions);
    const spendingPatterns = this.calculateSpendingPatterns(transactions);

    return {
      startDate,
      endDate,
      analytics,
      currencyBreakdown,
      feeAnalysis,
      spendingPatterns,
    };
  }

  private calculateAnalytics(transactions: any[]): TransactionAnalytics {
    const completed = transactions.filter((t) => t.status === 'completed');
    const failed = transactions.filter((t) => t.status === 'failed');
    const pending = transactions.filter((t) => t.status === 'pending');

    const totalVolume = transactions.reduce((sum, t) => {
      return sum + parseFloat(t.destinationAmount || '0');
    }, 0);

    return {
      totalTransactions: transactions.length,
      totalVolume: totalVolume.toFixed(2),
      averageAmount: transactions.length > 0 ? (totalVolume / transactions.length).toFixed(2) : '0',
      successRate: transactions.length > 0 ? (completed.length / transactions.length) * 100 : 0,
      failureRate: transactions.length > 0 ? (failed.length / transactions.length) * 100 : 0,
      pendingCount: pending.length,
    };
  }

  private calculateCurrencyBreakdown(transactions: any[]): CurrencyBreakdown[] {
    const breakdown: Record<string, any> = {};

    transactions.forEach((t) => {
      const currency = t.currency;
      if (!breakdown[currency]) {
        breakdown[currency] = { count: 0, volume: 0 };
      }
      breakdown[currency].count += 1;
      breakdown[currency].volume += parseFloat(t.destinationAmount || '0');
    });

    const totalVolume = Object.values(breakdown).reduce((sum: number, b: any) => sum + b.volume, 0);

    return Object.entries(breakdown).map(([currency, data]: [string, any]) => ({
      currency,
      count: data.count,
      volume: data.volume.toFixed(2),
      percentage: totalVolume > 0 ? (data.volume / totalVolume) * 100 : 0,
    }));
  }

  private calculateFeeAnalysis(transactions: any[]): FeeAnalysis {
    const totalBridgeFees = transactions.reduce((sum, t) => {
      return sum + parseFloat(t.bridgeFee || '0');
    }, 0);

    const totalPayoutFees = transactions.reduce((sum, t) => {
      return sum + parseFloat(t.payoutFee || '0');
    }, 0);

    const totalFees = totalBridgeFees + totalPayoutFees;
    const totalVolume = transactions.reduce((sum, t) => {
      return sum + parseFloat(t.amount || '0');
    }, 0);

    return {
      totalFeesPaid: totalFees.toFixed(2),
      averageFeePercentage: totalVolume > 0 ? (totalFees / totalVolume) * 100 : 0,
      bridgeFees: totalBridgeFees.toFixed(2),
      payoutFees: totalPayoutFees.toFixed(2),
    };
  }

  private calculateSpendingPatterns(transactions: any[]): SpendingPattern[] {
    const patterns: Record<string, any> = {};

    transactions.forEach((t) => {
      const date = new Date(t.timestamp).toISOString().split('T')[0];
      if (!patterns[date]) {
        patterns[date] = { amount: 0, count: 0, currencies: new Set() };
      }
      patterns[date].amount += parseFloat(t.destinationAmount || '0');
      patterns[date].count += 1;
      patterns[date].currencies.add(t.currency);
    });

    return Object.entries(patterns)
      .map(([date, data]: [string, any]) => ({
        date,
        amount: data.amount.toFixed(2),
        transactionCount: data.count,
        currency: Array.from(data.currencies).join(', '),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}
