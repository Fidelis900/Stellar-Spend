import { getCacheClient } from '@/lib/cache';
import {
  FeatureFlags,
  DEFAULT_FLAGS,
  ENV_OVERRIED_FLAGS,
  FeatureFlagSchema,
  resolveGradualRollback,
} from './schema';

const CACHE_PREFIX = 'feature-flags:';
const CACHE_TTL = 300;

export class FeatureFlagStore {
  private cache = getCacheClient();
  private overrides: Partial<FeatureFlags> = {};

  async get(userId?: string): Promise<FeatureFlags> {
    const cached = await this.cache.get(`${CACHE_PREFIX}current`);
    let flags: FeatureFlags;

    if (cached) {
      try {
        flags = FeatureFlagSchema.parse(JSON.parse(cached));
      } catch {
        flags = this.resolveFlags();
      }
    } else {
      flags = this.resolveFlags();
      await this.cache.set(`${CACHE_PREFIX}current`, JSON.stringify(flags), CACHE_TTL);
    }

    return flags;
  }

  setOverrides(overrides: Partial<FeatureFlags>): void {
    this.overrides = overrides;
    this.invalidate();
  }

  clearOverrides(): void {
    this.overrides = {};
    this.invalidate();
  }

  async invalidate(): Promise<void> {
    await this.cache.flushPattern(`${CACHE_PREFIX}*`);
  }

  isEnabled(
    flag: boolean | { enabled: boolean; percentage: number; seed?: string },
    userId?: string,
  ): boolean {
    return resolveGradualRollback(flag, userId);
  }

  private resolveFlags(): FeatureFlags {
    const env = process.env.NODE_ENV || 'development';
    const envOverrides = ENV_OVERRIDE_FLAGS[env] ?? {};

    const merged = this.deepMerge(DEFAULT_FLAGS, envOverrides);
    return this.deepMerge(merged, this.overrides) as FeatureFlags;
  }

  private deepMerge(target: unknown, source: unknown): unknown {
    if (
      typeof target !== 'object' ||
      target === null ||
      typeof source !== 'object' ||
      source === null
    ) {
      return source ?? target;
    }

    const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
    for (const key of Object.keys(source as Record<string, unknown>)) {
      const srcVal = (source as Record<string, unknown>)[key];
      const tgtVal = (target as Record<string, unknown>)[key];

      if (typeof srcVal === 'object' && srcVal !== null && !Array.isArray(srcVal)) {
        result[key] = this.deepMerge(tgtVal, srcVal);
      } else {
        result[key] = srcVal;
      }
    }
    return result;
  }
}

export const featureFlagStore = new FeatureFlagStore();
