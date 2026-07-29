import 'server-only';
import { featureFlagStore } from './store';
import { resolveGradualRollback } from './schema';
import type { FeatureFlags } from './schema';

export async function getFeatureFlags(userId?: string): Promise<FeatureFlags> {
  return featureFlagStore.get(userId);
}

export function isFlagEnabled(flags: FeatureFlags, path: string, userId?: string): boolean {
  const parts = path.split('.');
  let current: unknown = flags;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return false;
    }
  }

  if (typeof current === 'boolean') return current;
  if (current && typeof current === 'object' && 'enabled' in (current as Record<string, unknown>)) {
    return resolveGradualRollback(current as Parameters<typeof resolveGradualRollback>[0], userId);
  }

  return false;
}

export async function setFlagOverrides(overrides: Partial<FeatureFlags>): Promise<void> {
  featureFlagStore.setOverrides(overrides);
}

export async function clearFlagOverrides(): Promise<void> {
  featureFlagStore.clearOverrides();
}

export async function invalidateFlagCache(): Promise<void> {
  await featureFlagStore.invalidate();
}
