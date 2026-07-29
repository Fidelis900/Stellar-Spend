import { z } from 'zod';

export const PercentageSchema = z.number().min(0).max(1);

export const GradualRolloutSchema = z.object({
  enabled: z.boolean().default(false),
  percentage: PercentageSchema.default(0),
  seed: z.string().optional(),
});

export const FeatureFlagSchema = z.object({
  corridors: z.object({
    nigeriaNgn: z.union([z.boolean(), GradualRolloutSchema]).default(false),
    kenyaKes: z.union([z.boolean(), GradualRolloutSchema]).default(false),
    ghanaGhs: z.union([z.boolean(), GradualRolloutSchema]).default(false),
    brazilBrl: GradualRolloutSchema.default({ enabled: false, percentage: 0 }),
    mexicoMxn: GradualRolloutSchema.default({ enabled: false, percentage: 0 }),
  }),

  providers: z.object({
    paycrestV2: z.union([z.boolean(), GradualRolloutSchema]).default(false),
    allbridgeV2: GradualRolloutSchema.default({ enabled: false, percentage: 0 }),
  }),

  experiments: z.object({
    newQuoteEngine: GradualRolloutSchema.default({ enabled: false, percentage: 0 }),
    instantSettlement: z.union([z.boolean(), GradualRolloutSchema]).default(false),
    batchPayouts: GradualRolloutSchema.default({ enabled: false, percentage: 0 }),
    webhookV2: z.boolean().default(false),
  }),
});

export type FeatureFlags = z.infer<typeof FeatureFlagSchema>;

export const DEFAULT_FLAGS: FeatureFlags = {
  corridors: {
    nigeriaNgn: true,
    kenyaKes: true,
    ghanaGhs: true,
    brazilBrl: { enabled: false, percentage: 0 },
    mexicoMxn: { enabled: false, percentage: 0 },
  },
  providers: {
    paycrestV2: false,
    allbridgeV2: { enabled: false, percentage: 0 },
  },
  experiments: {
    newQuoteEngine: { enabled: false, percentage: 0 },
    instantSettlement: false,
    batchPayouts: { enabled: false, percentage: 0 },
    webhookV2: false,
  },
};

export function resolveGradualRollback(
  flag: boolean | z.infer<typeof GradualRolloutSchema>,
  userId?: string,
): boolean {
  if (typeof flag === 'boolean') return flag;
  if (!flag.enabled) return false;
  if (flag.percentage >= 1) return true;
  if (flag.percentage <= 0) return false;
  if (!userId) return false;

  let hash = 0;
  const seed = flag.seed ?? 'default';
  const key = `${seed}:${userId}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) / 0x7fffffff;
  return normalized < flag.percentage;
}

export const ENV_OVERRIED_FLAGS: Record<string, Partial<FeatureFlags>> = {
  development: {
    experiments: {
      newQuoteEngine: true,
      instantSettlement: true,
      batchPayouts: true,
      webhookV2: true,
    },
  },
  staging: {
    experiments: {
      newQuoteEngine: { enabled: true, percentage: 0.5 },
      batchPayouts: { enabled: true, percentage: 0.3 },
    },
  },
};
