import { logger } from '@/lib/logger';
import { Database } from 'postgres';

export interface SorobanEvent {
  id: string;
  contractId: string;
  type: string;
  data: Record<string, unknown>;
  txHash: string;
  ledgerSequence: number;
  timestamp: Date;
  indexed: boolean;
}

export interface IndexerState {
  lastProcessedLedger: number;
  lastProcessedHash: string;
  lastProcessedAt: Date;
}

export class SorobanEventIndexer {
  private db: Database;
  private rpcUrl: string;
  private contractIds: string[];

  constructor(db: Database, rpcUrl: string, contractIds: string[]) {
    this.db = db;
    this.rpcUrl = rpcUrl;
    this.contractIds = contractIds;
  }

  async initialize(): Promise<void> {
    await this.db`
      CREATE TABLE IF NOT EXISTS soroban_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        event_data JSONB NOT NULL,
        tx_hash VARCHAR NOT NULL,
        ledger_sequence INT NOT NULL,
        indexed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(tx_hash, contract_id, event_type)
      )
    `;

    await this.db`
      CREATE TABLE IF NOT EXISTS indexer_state (
        id INT PRIMARY KEY DEFAULT 1,
        last_processed_ledger INT,
        last_processed_hash VARCHAR,
        last_processed_at TIMESTAMP,
        CONSTRAINT only_one CHECK (id = 1)
      )
    `;

    await this.db`
      CREATE INDEX IF NOT EXISTS idx_soroban_events_contract
      ON soroban_events(contract_id)
    `;

    await this.db`
      CREATE INDEX IF NOT EXISTS idx_soroban_events_ledger
      ON soroban_events(ledger_sequence)
    `;
  }

  async getIndexerState(): Promise<IndexerState> {
    const result = await this.db`
      SELECT last_processed_ledger, last_processed_hash, last_processed_at
      FROM indexer_state
      WHERE id = 1
    `;

    if (result.length === 0) {
      return {
        lastProcessedLedger: 0,
        lastProcessedHash: '',
        lastProcessedAt: new Date(),
      };
    }

    return {
      lastProcessedLedger: result[0].last_processed_ledger || 0,
      lastProcessedHash: result[0].last_processed_hash || '',
      lastProcessedAt: result[0].last_processed_at || new Date(),
    };
  }

  async indexEvents(): Promise<number> {
    const state = await this.getIndexerState();
    let eventCount = 0;

    for (const contractId of this.contractIds) {
      try {
        const events = await this.fetchContractEvents(contractId, state.lastProcessedLedger);
        eventCount += await this.persistEvents(events);
      } catch (error) {
        logger.error(`Failed to index events for contract ${contractId}:`, {}, error);
      }
    }

    if (eventCount > 0) {
      await this.updateIndexerState();
    }

    return eventCount;
  }

  private async fetchContractEvents(
    contractId: string,
    fromLedger: number,
  ): Promise<SorobanEvent[]> {
    try {
      const response = await fetch(`${this.rpcUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'getEvents',
          params: [
            {
              filters: [
                {
                  type: 'contract',
                  contractIds: [contractId],
                },
              ],
              startLedger: fromLedger,
              limit: 100,
            },
          ],
        }),
      });

      const result = await response.json();

      if (result.error) {
        logger.error('Event fetch error:', {}, result.error);
        return [];
      }

      return (result.result?.events || []).map((event: any) => ({
        id: event.id,
        contractId,
        type: event.type,
        data: event.data,
        txHash: event.txHash,
        ledgerSequence: event.ledgerSequence,
        timestamp: new Date(event.timestamp * 1000),
        indexed: false,
      }));
    } catch (error) {
      logger.error('Failed to fetch contract events:', {}, error);
      return [];
    }
  }

  private async persistEvents(events: SorobanEvent[]): Promise<number> {
    if (events.length === 0) return 0;

    let insertedCount = 0;

    for (const event of events) {
      try {
        const result = await this.db`
          INSERT INTO soroban_events
          (contract_id, event_type, event_data, tx_hash, ledger_sequence, indexed_at)
          VALUES
          (${event.contractId}, ${event.type}, ${JSON.stringify(event.data)}, ${event.txHash}, ${event.ledgerSequence}, ${new Date()})
          ON CONFLICT (tx_hash, contract_id, event_type) DO NOTHING
          RETURNING id
        `;

        if (result.length > 0) {
          insertedCount++;
          await this.mapEventToTransaction(event);
        }
      } catch (error) {
        logger.error(`Failed to persist event ${event.id}:`, {}, error);
      }
    }

    return insertedCount;
  }

  private async mapEventToTransaction(event: SorobanEvent): Promise<void> {
    try {
      const txRecord = await this.db`
        SELECT id FROM transactions WHERE tx_hash = ${event.txHash} LIMIT 1
      `;

      if (txRecord.length > 0) {
        await this.db`
          UPDATE transactions
          SET soroban_event_id = ${event.id}, verified_on_chain = true
          WHERE tx_hash = ${event.txHash}
        `;
      }
    } catch (error) {
      logger.error(`Failed to map event to transaction:`, {}, error);
    }
  }

  private async updateIndexerState(): Promise<void> {
    const latestEvent = await this.db`
      SELECT MAX(ledger_sequence) as max_ledger, tx_hash
      FROM soroban_events
      ORDER BY ledger_sequence DESC
      LIMIT 1
    `;

    if (latestEvent.length > 0) {
      await this.db`
        INSERT INTO indexer_state (last_processed_ledger, last_processed_hash, last_processed_at)
        VALUES (${latestEvent[0].max_ledger}, ${latestEvent[0].tx_hash}, ${new Date()})
        ON CONFLICT (id) DO UPDATE SET
          last_processed_ledger = EXCLUDED.last_processed_ledger,
          last_processed_hash = EXCLUDED.last_processed_hash,
          last_processed_at = EXCLUDED.last_processed_at
      `;
    }
  }

  async getEventsByTransaction(txHash: string): Promise<SorobanEvent[]> {
    const result = await this.db`
      SELECT * FROM soroban_events WHERE tx_hash = ${txHash}
    `;

    return result.map((row) => ({
      id: row.id,
      contractId: row.contract_id,
      type: row.event_type,
      data: row.event_data,
      txHash: row.tx_hash,
      ledgerSequence: row.ledger_sequence,
      timestamp: row.created_at,
      indexed: row.indexed_at !== null,
    }));
  }

  async reconcileStatus(txHash: string): Promise<{ onChain: boolean; status: string }> {
    const events = await this.getEventsByTransaction(txHash);

    if (events.length === 0) {
      return { onChain: false, status: 'pending_indexing' };
    }

    const status = events.some((e) => e.type === 'success') ? 'success' : 'failed';
    return { onChain: true, status };
  }
}
