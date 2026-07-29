import { describe, expect, it } from 'vitest';
import {
  resolveGradualRollback,
  DEFAULT_FLAGS,
  FeatureFlagSchema,
  ENV_OVERRIED_FLAGS,
} from '../schema';

describe('Feature Flag Schema', () => {
  it('parses default flags', () => {
    const flags = FeatureFlagSchema.parse(DEFAULT_FLAGS);
    expect(flags.corridors.nigeriaNgn).toBe(true);
    expect(flags.corridors.brazilBrl).toEqual({ enabled: false, percentage: 0 });
  });

  it('parses env overrides for development', () => {
    const dev = ENV_OVERRIED_FLAGS.development;
    expect(dev.experiments?.newQuoteEngine).toBe(true);
  });

  it('accepts boolean values for simple flags', () => {
    const flags = FeatureFlagSchema.parse({
      corridors: {
        nigeriaNgn: true,
        kenyaKes: false,
        ghanaGhs: true,
        brazilBrl: { enabled: false, percentage: 0 },
        mexicoMxn: { enabled: false, percentage: 0 },
      },
      providers: { paycrestV2: true, allbridgeV2: { enabled: false, percentage: 0 } },
      experiments: {
        newQuoteEngine: { enabled: false, percentage: 0 },
        instantSettlement: false,
        batchPayouts: { enabled: false, percentage: 0 },
        webhookV2: true,
      },
    });
    expect(flags.corridors.nigeriaNgn).toBe(true);
    expect(flags.providers.paycrestV2).toBe(true);
    expect(flags.experiments.webhookV2).toBe(true);
  });
});

describe('resolveGradualRollback', () => {
  it('returns the boolean value directly', () => {
    expect(resolveGradualRollback(true)).toBe(true);
    expect(resolveGradualRollback(false)).toBe(false);
  });

  it('returns false when rollout is not enabled', () => {
    expect(resolveGradualRollback({ enabled: false, percentage: 0.5 }, 'user_1')).toBe(false);
  });

  it('returns true for 100% rollout', () => {
    expect(resolveGradualRollback({ enabled: true, percentage: 1 }, 'user_1')).toBe(true);
  });

  it('returns false for 0% rollout', () => {
    expect(resolveGradualRollback({ enabled: true, percentage: 0 }, 'user_1')).toBe(false);
  });

  it('deterministically resolves users within a percentage', () => {
    const flag = { enabled: true, percentage: 0.5, seed: 'test-seed' };
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(resolveGradualRollback(flag, `user_${i}`));
    }
    expect(results.has(true)).toBe(true);
    expect(results.has(false)).toBe(true);
  });

  it('returns false when userId is not provided for partial rollout', () => {
    expect(resolveGradualRollback({ enabled: true, percentage: 0.5 })).toBe(false);
  });
});
