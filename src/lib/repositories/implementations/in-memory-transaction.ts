import type { TransactionRepository, Transaction } from '../transaction';

export class InMemoryTransactionRepository implements TransactionRepository {
  private transactions: Map<string, Transaction> = new Map();

  async save(transaction: Transaction): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }

  async update(id: string, updates: Partial<Transaction>): Promise<void> {
    const transaction = this.transactions.get(id);
    if (!transaction) throw new Error(`Transaction ${id} not found`);

    this.transactions.set(id, { ...transaction, ...updates });
  }

  async getById(id: string): Promise<Transaction | null> {
    return this.transactions.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.transactions.delete(id);
  }

  async getAll(): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  async getByUser(userAddress: string): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.userAddress === userAddress);
  }

  async getByPayoutOrderId(orderId: string): Promise<Transaction | null> {
    for (const transaction of this.transactions.values()) {
      if (transaction.payoutOrderId === orderId) {
        return transaction;
      }
    }
    return null;
  }
}
