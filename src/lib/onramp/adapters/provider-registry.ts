import type { DepositProviderAdapter } from './deposit-provider';
import type { OnrampProviderCapabilities } from './deposit-provider';

export interface ProviderRoute {
  fiatCurrency: string;
  destinationToken: string;
  provider: string;
  priority: number;
}

export class OnrampProviderRegistry {
  private providers: Map<string, DepositProviderAdapter> = new Map();
  private routes: ProviderRoute[] = [];
  private capabilities: Map<string, OnrampProviderCapabilities> = new Map();

  register(name: string, adapter: DepositProviderAdapter): void {
    this.providers.set(name, adapter);
    this.capabilities.set(name, adapter.getCapabilities());
  }

  getProvider(name: string): DepositProviderAdapter | undefined {
    return this.providers.get(name);
  }

  getProvidersForCorridor(fiatCurrency: string, destinationToken: string): string[] {
    const direct = this.routes
      .filter((r) => r.fiatCurrency === fiatCurrency && r.destinationToken === destinationToken)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.provider);

    const byCapability = Array.from(this.capabilities.entries())
      .filter(
        ([name, caps]) =>
          caps.supportedFiatCurrencies.includes(fiatCurrency) &&
          caps.supportedDestinationTokens.includes(destinationToken),
      )
      .map(([name]) => name)
      .filter((name) => !direct.includes(name));

    return [...new Set([...direct, ...byCapability])];
  }

  getAllProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async checkHealth(name: string): Promise<{ ok: boolean; latencyMs: number }> {
    const provider = this.providers.get(name);
    if (!provider) return { ok: false, latencyMs: 0 };
    try {
      return await provider.getHealth();
    } catch {
      return { ok: false, latencyMs: 0 };
    }
  }

  async checkAllHealth(): Promise<Record<string, { ok: boolean; latencyMs: number }>> {
    const results: Record<string, { ok: boolean; latencyMs: number }> = {};
    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.getHealth();
      } catch {
        results[name] = { ok: false, latencyMs: 0 };
      }
    }
    return results;
  }

  configureRoutes(routes: ProviderRoute[]): void {
    this.routes = routes;
  }

  getCapabilities(name: string): OnrampProviderCapabilities | undefined {
    return this.capabilities.get(name);
  }
}

export const onrampProviderRegistry = new OnrampProviderRegistry();
