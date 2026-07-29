const requiredServerEnvKeys = [
  'PAYCREST_API_KEY',
  'PAYCREST_WEBHOOK_SECRET',
  'BASE_PRIVATE_KEY',
  'BASE_RETURN_ADDRESS',
  'BASE_RPC_URL',
  'STELLAR_SOROBAN_RPC_URL',
  'STELLAR_HORIZON_URL',
  'DATABASE_URL',
] as const;

const requiredPublicEnvKeys = [
  'NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL',
  'NEXT_PUBLIC_BASE_RETURN_ADDRESS',
  'NEXT_PUBLIC_STELLAR_USDC_ISSUER',
] as const;

const forbiddenPublicSecretKeys = [
  'NEXT_PUBLIC_PAYCREST_API_KEY',
  'NEXT_PUBLIC_BASE_PRIVATE_KEY',
] as const;

type RequiredServerEnvKey = (typeof requiredServerEnvKeys)[number];
type RequiredPublicEnvKey = (typeof requiredPublicEnvKeys)[number];

function isMissing(value: string | undefined) {
  return !value || value.trim().length === 0;
}

function buildEnvErrorMessage(
  missingServerKeys: string[],
  missingPublicKeys: string[],
  forbiddenPublicKeys: string[],
) {
  const lines = [
    'Invalid environment configuration for Stellar-Spend.',
    'Create or update .env.local using .env.example before starting the server.',
  ];

  if (missingServerKeys.length > 0) {
    lines.push('');
    lines.push(`Missing required server env vars: ${missingServerKeys.join(', ')}`);
  }

  if (missingPublicKeys.length > 0) {
    lines.push('');
    lines.push(`Missing required public env vars: ${missingPublicKeys.join(', ')}`);
  }

  if (forbiddenPublicKeys.length > 0) {
    lines.push('');
    lines.push(`Remove secret values from public env vars: ${forbiddenPublicKeys.join(', ')}`);
    lines.push('PAYCREST_API_KEY and BASE_PRIVATE_KEY must never use the NEXT_PUBLIC_ prefix.');
  }

  return lines.join('\n');
}

export function validateEnv() {
  const missingServerKeys = requiredServerEnvKeys.filter((key) => isMissing(process.env[key]));
  const missingPublicKeys = requiredPublicEnvKeys.filter((key) => isMissing(process.env[key]));
  const forbiddenPublicKeys = forbiddenPublicSecretKeys.filter(
    (key) => !isMissing(process.env[key]),
  );

  if (
    missingServerKeys.length > 0 ||
    missingPublicKeys.length > 0 ||
    forbiddenPublicKeys.length > 0
  ) {
    throw new Error(
      buildEnvErrorMessage(missingServerKeys, missingPublicKeys, forbiddenPublicKeys),
    );
  }

  return {
    server: Object.fromEntries(
      requiredServerEnvKeys.map((key) => [key, process.env[key]!]),
    ) as Record<RequiredServerEnvKey, string>,
    public: Object.fromEntries(
      requiredPublicEnvKeys.map((key) => [key, process.env[key]!]),
    ) as Record<RequiredPublicEnvKey, string>,
  };
}

export const env = process.env.VITEST ? ({} as ReturnType<typeof validateEnv>) : validateEnv();
