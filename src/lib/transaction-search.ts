import type { Transaction } from '@/lib/transaction-storage';

export interface SearchFilters {
  query?: string;
  status?: Transaction['status'] | 'all';
  dateFrom?: number;
  dateTo?: number;
  amountMin?: number;
  amountMax?: number;
  currency?: string;
  isFavorite?: boolean;
  /** Match transactions that have at least one of these tag names */
  tags?: string[];
}

export class TransactionSearchService {
  static search(transactions: Transaction[], filters: SearchFilters): Transaction[] {
    let results = [...transactions];

    // Full-text search
    if (filters.query?.trim()) {
      const q = filters.query.trim().toLowerCase();
      results = results.filter(tx =>
        tx.id.toLowerCase().includes(q) ||
        tx.stellarTxHash?.toLowerCase().includes(q) ||
        tx.note?.toLowerCase().includes(q) ||
        tx.beneficiary.accountName.toLowerCase().includes(q) ||
        tx.beneficiary.institution.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filters.status && filters.status !== 'all') {
      results = results.filter(tx => tx.status === filters.status);
    }

    // Date range
    if (filters.dateFrom !== undefined) {
      results = results.filter(tx => tx.timestamp >= filters.dateFrom!);
    }
    if (filters.dateTo !== undefined) {
      results = results.filter(tx => tx.timestamp <= filters.dateTo!);
    }

    // Amount range
    if (filters.amountMin !== undefined) {
      results = results.filter(tx => parseFloat(tx.amount) >= filters.amountMin!);
    }
    if (filters.amountMax !== undefined) {
      results = results.filter(tx => parseFloat(tx.amount) <= filters.amountMax!);
    }

    // Currency filter
    if (filters.currency) {
      results = results.filter(tx => tx.currency === filters.currency);
    }

    // Favorite filter
    if (filters.isFavorite !== undefined) {
      results = results.filter(tx => tx.isFavorite === filters.isFavorite);
    }

    // Tags filter (match any of the requested tag names)
    if (filters.tags && filters.tags.length > 0) {
      const wanted = filters.tags.map(t => t.toLowerCase());
      results = results.filter(tx =>
        tx.tags?.some(tag => wanted.includes(tag.name.toLowerCase())) ?? false
      );
    }

    return results;
  }

  static getSearchSuggestions(
    transactions: Transaction[],
    query: string,
    limit: number = 5
  ): string[] {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const suggestions = new Set<string>();

    transactions.forEach(tx => {
      if (tx.id.toLowerCase().includes(q)) suggestions.add(tx.id);
      if (tx.stellarTxHash?.toLowerCase().includes(q)) suggestions.add(tx.stellarTxHash);
      if (tx.beneficiary.accountName.toLowerCase().includes(q)) {
        suggestions.add(tx.beneficiary.accountName);
      }
      if (tx.beneficiary.institution.toLowerCase().includes(q)) {
        suggestions.add(tx.beneficiary.institution);
      }
    });

    return Array.from(suggestions).slice(0, limit);
  }
}
