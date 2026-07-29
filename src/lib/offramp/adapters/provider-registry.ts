import type { BridgeProviderAdapter } from './bridge-provider';
import type { PayoutProviderAdapter } from './payout-provider';

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  lastChecked: number;
  error?: string;
}

export interface ProviderCapabilities {
  supportedSourceChains: string[];
  supportedDestinationChains: string[];
  supportedTokens: string[];
  supportedFiatCurrencies?: string[];
  maxAmount: number;
  minAmount: number;
  averageCompletionTimeMs: number;
}

export interface PerCorridorRoute {
  corridor: string;
  sourceChain: string;
  destinationChain: string;
  token: string;
  fiatCurrency?: string;
  bridgeProvider: string;
  payoutProvider?: string;
  priority: number;
}

export class BridgeProviderRegistry {
  private bridges: Map<string, BridgeProviderAdapter> = new Map();
  private payouts: Map<string, PayoutProviderAdapter> = new Map();
  private healthCache: Map<string, ProviderHealth> = new Map();
  private routes: PerCorridorRoute[] = [];

  registerBridge(name: string, adapter: BridgeProviderAdapter): void {
    this.bridges.set(name, adapter);
  }

  registerPayout(name: string, adapter: PayoutProviderAdapter): void {
    this.payouts.set(name, adapter);
  }

  getBridge(name: string): BridgeProviderAdapter | undefined {
    return this.bridges.get(name);
  }

  getPayout(name: string): PayoutProviderAdapter | undefined {
    return this.payouts.get(name);
  }

  getEligibleBridges(corridor: string): string[] {
    const routeProviders = this.routes
      .filter((r) => r.corridor === corridor)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.bridgeProvider);

    const healthy = routeProviders.filter((p) => {
      const health = this.healthCache.get(p);
      return !health || health.ok;
    });

    return healthy.length > 0 ? healthy : routeProviders;
  }

  getEligiblePayouts(currency: string): string[] {
    const routeProviders = this.routes
      .filter((r) => r.fiatCurrency === currency)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.payoutProvider)
      .filter(Boolean) as string[];

    const healthy = routeProviders.filter((p) => {
      const health = this.healthCache.get(p);
      return !health || health.ok;
    });

    return healthy.length > 0 ? healthy : routeProviders;
  }

  getAllBridgeNames(): string[] {
    return Array.from(this.bridges.keys());
  }

  getAllPayoutNames(): string[] {
    return Array.from(this.payouts.keys());
  }

  async checkBridgeHealth(name: string): Promise<ProviderHealth> {
    const adapter = this.bridges.get(name);
    if (!adapter) {
      return { ok: false, latencyMs: 0, lastChecked: Date.now(), error: 'Unknown provider' };
    }

    const start = Date.now();
    try {
      const status = await adapter.getTransferStatus('test-id');
      const latency = Date.now() - start;
      const health: ProviderHealth = { ok: true, latencyMs: latency, lastChecked: Date.now() };
      this.healthCache.set(name, health);
      return health;
    } catch (err) {
      const latency = Date.now() - start;
      const health: ProviderHealth = {
        ok: false,
        latencyMs: latency,
        lastChecked: Date.now(),
        error: err instanceof Error ? err.message : 'Health check failed',
      };
      this.healthCache.set(name, health);
      return health;
    }
  }

  async checkPayoutHealth(name: string): Promise<ProviderHealth> {
    const adapter = this.payouts.get(name);
    if (!adapter) {
      return { ok: false, latencyMs: 0, lastChecked: Date.now(), error: 'Unknown provider' };
    }

    const start = Date.now();
    try {
      await adapter.getCurrencies();
      const latency = Date.now() - start;
      const health: ProviderHealth = { ok: true, latencyMs: latency, lastChecked: Date.now() };
      this.healthCache.set(name, health);
      return health;
    } catch (err) {
      const latency = Date.now() - start;
      const health: ProviderHealth = {
        ok: false,
        latencyMs: latency,
        lastChecked: Date.now(),
        error: err instanceof Error ? err.message : 'Health check failed',
      };
      this.healthCache.set(name, health);
      return health;
    }
  }

  async checkAllHealth(): Promise<Record<string, ProviderHealth>> {
    const results: Record<string, ProviderHealth> = {};

    for (const name of this.bridges.keys()) {
      results[`bridge:${name}`] = await this.checkBridgeHealth(name);
    }
    for (const name of this.payouts.keys()) {
      results[`payout:${name}`] = await this.checkPayoutHealth(name);
    }

    return results;
  }

  getHealth(name: string): ProviderHealth | undefined {
    return this.healthCache.get(name);
  }

  isHealthy(name: string): boolean {
    const health = this.healthCache.get(name);
    return !health || health.ok;
  }

  configureRoutes(routes: PerCorridorRoute[]): void {
    this.routes = routes;
  }

  getRoutesForCorridor(corridor: string): PerCorridorRoute[] {
    return this.routes.filter((r) => r.corridor === corridor);
  }
}

export const providerRegistry = new BridgeProviderRegistry();
