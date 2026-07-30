import { validateAmount, validateAddress } from '@/lib/offramp';
import { extractErrorMessage } from '@/lib/offramp';

export interface BuildTxRequest {
  amount: string;
  fromAddress: string;
  toAddress: string;
  feePaymentMethod?: 'native' | 'stablecoin';
}

export interface BuildTxResponse {
  xdr: string;
  sourceToken: {
    symbol: string;
    decimals: number;
    contract?: string;
    chain: string;
  };
  destinationToken: {
    symbol: string;
    decimals: number;
    contract?: string;
    chain: string;
  };
}

export interface SubmitTxRequest {
  xdr: string;
  signature: string;
}

export interface SubmitTxResponse {
  txHash: string;
  status: string;
}

export class BridgeService {
  async buildTransaction(request: BuildTxRequest): Promise<BuildTxResponse> {
    this.validateBuildRequest(request);

    const feeMethod = request.feePaymentMethod || 'stablecoin';

    // Build transaction logic would go here
    // This is a placeholder that would integrate with Allbridge SDK
    return {
      xdr: 'AAAAAgAAAAB...',
      sourceToken: {
        symbol: 'USDC',
        decimals: 7,
        chain: 'STELLAR',
      },
      destinationToken: {
        symbol: 'USDC',
        decimals: 6,
        chain: 'BASE',
      },
    };
  }

  async submitTransaction(request: SubmitTxRequest): Promise<SubmitTxResponse> {
    if (!request.xdr || !request.signature) {
      throw new Error('XDR and signature are required');
    }

    // Submit transaction logic would go here
    // This would submit to Stellar network
    return {
      txHash: `tx_${Date.now()}`,
      status: 'submitted',
    };
  }

  async getTransactionStatus(txHash: string): Promise<{ status: string; bridgeAmount?: string }> {
    if (!txHash) {
      throw new Error('Transaction hash is required');
    }

    // Poll bridge status logic would go here
    return {
      status: 'completed',
      bridgeAmount: '99.5',
    };
  }

  private validateBuildRequest(request: BuildTxRequest): void {
    if (!validateAmount(request.amount)) {
      throw new Error('Invalid amount: must be a positive number');
    }

    if (!validateAddress(request.fromAddress, 'stellar')) {
      throw new Error('Invalid Stellar address');
    }

    if (!validateAddress(request.toAddress, 'base')) {
      throw new Error('Invalid Base address');
    }

    if (request.feePaymentMethod && !['native', 'stablecoin'].includes(request.feePaymentMethod)) {
      throw new Error('feePaymentMethod must be "native" or "stablecoin"');
    }
  }
}
