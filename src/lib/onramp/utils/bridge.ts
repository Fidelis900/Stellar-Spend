import { env } from '@/lib/env';

export interface BridgeOnrampRequest {
  amount: string;
  sourceToken: string;
  destinationToken: string;
  destinationAddress: string;
  sourceChain: string;
  destinationChain: string;
}

export interface BridgeOnrampResponse {
  txHash?: string;
  status: string;
  estimatedTime: number;
}

export async function bridgeFromBaseToStellar(
  request: BridgeOnrampRequest,
): Promise<BridgeOnrampResponse> {
  const sorobanRpc = env.server.STELLAR_SOROBAN_RPC_URL;
  if (!sorobanRpc) {
    throw new Error('Soroban RPC URL not configured');
  }

  return {
    status: 'pending',
    estimatedTime: 120,
  };
}

export async function pollBridgeStatus(
  txHash: string,
): Promise<{ status: string; txHash?: string }> {
  return { status: 'pending', txHash };
}
