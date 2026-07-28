import { HttpClient } from './http-client';
import { type ClientConfig } from './base';

export interface AllbridgeClientConfig extends ClientConfig {
  sorobanRpcUrl: string;
  horizonUrl: string;
}

export interface BridgeQuote {
  sourceToken: { symbol: string; decimals: number; chain: string };
  destinationToken: { symbol: string; decimals: number; chain: string };
  amount: string;
  fee: string;
}

export class AllbridgeClient {
  private sorobanHttp: HttpClient;
  private horizonHttp: HttpClient;

  constructor(config: AllbridgeClientConfig) {
    const shared = {
      timeout: config.timeout,
      retries: config.retries,
      retryDelay: config.retryDelay,
      headers: { 'Content-Type': 'application/json' },
    };
    this.sorobanHttp = new HttpClient({ ...shared, baseUrl: config.sorobanRpcUrl });
    this.horizonHttp = new HttpClient({ ...shared, baseUrl: config.horizonUrl });
  }

  async getQuote(
    sourceChain: string,
    destinationChain: string,
    token: string,
    amount: string,
  ): Promise<BridgeQuote> {
    return this.sorobanHttp.get(
      `/quote?sourceChain=${sourceChain}&destinationChain=${destinationChain}&token=${token}&amount=${amount}`,
    );
  }

  async getTransactionStatus(txHash: string): Promise<{ status: string; hash: string }> {
    return this.horizonHttp.get(`/transactions/${txHash}`);
  }

  async submitTransaction(xdr: string): Promise<{ hash: string; status: string }> {
    return this.horizonHttp.post('/transactions', { tx: xdr });
  }
}
