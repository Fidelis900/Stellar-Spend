import { logger } from '@/lib/logger';
import { Account, Keypair, Networks, Operation, TransactionBuilder } from 'stellar-sdk';

interface ResourceFeeEstimate {
  cpuInstructions: number;
  memoryBytes: number;
  contractDataWrites: number;
  contractDataReads: number;
  estimatedFeeStroops: number;
  estimatedFeeXLM: string;
}

interface SimulationResult {
  footprint: {
    readBytes: number;
    writeBytes: number;
  };
  estimatedFee: number;
  error?: string;
}

const STROOPS_PER_XLM = 10_000_000;
const BASE_FEE_STROOPS = 100;

export class ResourceFeeEstimator {
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async estimateContractInvocation(
    contractId: string,
    method: string,
    args: unknown[],
    sourceAccount: Account,
  ): Promise<ResourceFeeEstimate> {
    try {
      const simulation = await this.simulateTransaction(contractId, method, args, sourceAccount);

      return this.calculateFeeEstimate(simulation);
    } catch (error) {
      logger.error('Failed to estimate resource fees:', {}, error);
      return this.getDefaultEstimate();
    }
  }

  private async simulateTransaction(
    contractId: string,
    method: string,
    args: unknown[],
    sourceAccount: Account,
  ): Promise<SimulationResult> {
    const keypair = Keypair.random();
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE_STROOPS,
      networkPassphrase: Networks.PUBLIC_NETWORK,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          method: method,
          parameters: args as any[],
        }),
      )
      .setTimeout(30)
      .build();

    try {
      const response = await fetch(`${this.rpcUrl}/simulateTransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'simulateTransaction',
          params: [tx.toXDR()],
        }),
      });

      const result = await response.json();

      if (result.error) {
        logger.error('Simulation error:', {}, result.error);
        return {
          footprint: { readBytes: 0, writeBytes: 0 },
          estimatedFee: 0,
          error: result.error.message,
        };
      }

      const resultXdr = result.result.results?.[0];
      return {
        footprint: {
          readBytes: resultXdr?.readBytes || 0,
          writeBytes: resultXdr?.writeBytes || 0,
        },
        estimatedFee: resultXdr?.minResourceFee || BASE_FEE_STROOPS,
      };
    } catch (error) {
      logger.error('Simulation request failed:', {}, error);
      return { footprint: { readBytes: 0, writeBytes: 0 }, estimatedFee: 0, error: String(error) };
    }
  }

  private calculateFeeEstimate(simulation: SimulationResult): ResourceFeeEstimate {
    const totalBytes = simulation.footprint.readBytes + simulation.footprint.writeBytes;
    const storageOps = Math.ceil(totalBytes / 32);
    const cpuInstructions = Math.max(1000, storageOps * 500);
    const estimatedFeeStroops = Math.max(
      simulation.estimatedFee,
      cpuInstructions + storageOps * BASE_FEE_STROOPS,
    );

    return {
      cpuInstructions,
      memoryBytes: totalBytes,
      contractDataWrites: simulation.footprint.writeBytes,
      contractDataReads: simulation.footprint.readBytes,
      estimatedFeeStroops,
      estimatedFeeXLM: (estimatedFeeStroops / STROOPS_PER_XLM).toFixed(7),
    };
  }

  private getDefaultEstimate(): ResourceFeeEstimate {
    return {
      cpuInstructions: 10_000,
      memoryBytes: 1024,
      contractDataWrites: 0,
      contractDataReads: 0,
      estimatedFeeStroops: 1000,
      estimatedFeeXLM: '0.0001000',
    };
  }

  optimizeStorageAccess(contractCalls: Array<{ method: string; reads: number; writes: number }>) {
    return contractCalls.map((call) => ({
      ...call,
      optimized: {
        batched: true,
        cacheHint: 'prefer_local',
        parallelizable: call.writes === 0,
      },
    }));
  }
}
