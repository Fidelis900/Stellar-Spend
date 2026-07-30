import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { SorobanEventIndexer } from '@/lib/stellar';
import { db } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const txHash = searchParams.get('txHash');
    const transactionId = searchParams.get('transactionId');

    if (!txHash && !transactionId) {
      return NextResponse.json({ error: 'txHash or transactionId required' }, { status: 400 });
    }

    const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const indexer = new SorobanEventIndexer(
      db,
      rpcUrl,
      [process.env.ESCROW_CONTRACT_ID || '', process.env.FEE_MANAGER_CONTRACT_ID || ''].filter(
        Boolean,
      ),
    );

    let hash = txHash;

    if (transactionId && !txHash) {
      const tx = await db`
        SELECT tx_hash FROM transactions WHERE id = ${transactionId} AND user_id = ${user.id}
      `;

      if (tx.length === 0) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      hash = tx[0].tx_hash;
    }

    const events = await indexer.getEventsByTransaction(hash);
    const { onChain, status } = await indexer.reconcileStatus(hash);

    return NextResponse.json({
      txHash: hash,
      onChain,
      status,
      events: events.map((e) => ({
        type: e.type,
        data: e.data,
        ledgerSequence: e.ledgerSequence,
        timestamp: e.timestamp,
      })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch on-chain status:', {}, error);
    return NextResponse.json(
      { error: 'Failed to fetch status', message: String(error) },
      { status: 500 },
    );
  }
}
