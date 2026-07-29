# Secrets Management

This document describes how Stellar-Spend manages application secrets: where they live, how to validate them, how to rotate them, and access control rules.

---

## Secret Inventory

| Secret                    | Server-only | Description                                                            |
| ------------------------- | ----------- | ---------------------------------------------------------------------- |
| `PAYCREST_API_KEY`        | ✅          | Paycrest API key for creating quotes and payout orders                 |
| `PAYCREST_WEBHOOK_SECRET` | ✅          | HMAC secret for verifying incoming Paycrest webhook events             |
| `BASE_PRIVATE_KEY`        | ✅          | Private key of the Base wallet that signs on-chain payout transactions |
| `BASE_RETURN_ADDRESS`     | ✅          | Base address for refunds / treasury routing                            |
| `BASE_RPC_URL`            | ✅          | Base mainnet RPC provider URL                                          |
| `STELLAR_SOROBAN_RPC_URL` | ✅          | Soroban RPC endpoint for server-side transaction building              |
| `STELLAR_HORIZON_URL`     | ✅          | Horizon endpoint for account and trustline lookups                     |
| `DATABASE_URL`            | ✅          | PostgreSQL connection string                                           |
| `API_KEY_ADMIN_TOKEN`     | ✅          | Bearer token for admin API key management                              |
| `SENTRY_AUTH_TOKEN`       | ✅          | Sentry token for source map uploads (CI only)                          |

> ⚠️ **None of the above may use the `NEXT_PUBLIC_` prefix.** The app throws a startup error if `NEXT_PUBLIC_PAYCREST_API_KEY`, `NEXT_PUBLIC_BASE_PRIVATE_KEY`, or `NEXT_PUBLIC_PAYCREST_WEBHOOK_SECRET` are set.

---

## Where Secrets Live

### Local development

Copy `.env.example` to `.env.local` and fill in real values:

```bash
cp .env.example .env.local
```

`.env.local` is listed in `.gitignore` and must **never** be committed.

### Production (Vercel)

Set secrets in **Vercel → Settings → Environment Variables** for the Production environment. Vercel injects them at build time and runtime without writing them to disk.

### Production (Docker / Kubernetes)

**Docker Compose** — pass secrets via `--env-file`:

```bash
docker compose up -d  # reads .env.local by default
```

**Kubernetes** — create a Secret from your env file, then reference it in the Deployment:

```bash
kubectl create secret generic stellar-spend-secrets --from-env-file=.env.local
```

The `k8s/deployment.yaml` manifest references this secret via `envFrom.secretRef`.

---

## Validating Secrets

Run the validation script before deploying to catch missing or placeholder values:

```bash
chmod +x scripts/validate-secrets.sh
./scripts/validate-secrets.sh .env.local
```

The script checks:

- All required server-side secrets are present and not placeholder values
- All required public variables are present
- No secrets are accidentally exposed via `NEXT_PUBLIC_` prefixed variables

Exit code `0` = all good. Exit code `1` = one or more issues found.

The same validation runs automatically at app startup via `src/lib/env.ts` — the server throws if any required variable is missing or a secret is exposed publicly.

---

## Rotating Secrets

Use the rotation script to update a secret in your env file:

```bash
chmod +x scripts/rotate-secret.sh
./scripts/rotate-secret.sh PAYCREST_API_KEY .env.local
```

The script:

1. Prompts for the new value (hidden input — not echoed to the terminal)
2. Creates a timestamped backup of the env file (e.g. `.env.local.bak.20260425120000`)
3. Updates the value in-place
4. Prints service-specific next steps (e.g. revoke old key in Paycrest dashboard)

### Rotation checklist per secret

**`PAYCREST_API_KEY`**

1. Generate a new key in the Paycrest dashboard
2. Run `./scripts/rotate-secret.sh PAYCREST_API_KEY`
3. Redeploy the application
4. Verify the new key works (check `/api/health` and a test quote)
5. Revoke the old key in the Paycrest dashboard

**`PAYCREST_WEBHOOK_SECRET`**

1. Generate a new secret in Paycrest webhook settings
2. Run `./scripts/rotate-secret.sh PAYCREST_WEBHOOK_SECRET`
3. Redeploy the application
4. Update the secret in Paycrest simultaneously to avoid a gap

**`BASE_PRIVATE_KEY`**

1. Generate a new Base wallet
2. Transfer any funds from the old wallet to the new wallet
3. Run `./scripts/rotate-secret.sh BASE_PRIVATE_KEY`
4. Update `BASE_RETURN_ADDRESS` and `NEXT_PUBLIC_BASE_RETURN_ADDRESS` if the address changed
5. Redeploy the application

**`DATABASE_URL`**

1. Provision new database credentials
2. Run `./scripts/rotate-secret.sh DATABASE_URL`
3. Redeploy the application
4. Revoke the old credentials

---

## Access Controls

- **`.env.local`** — readable only by the developer who owns the machine. Do not share this file.
- **Vercel secrets** — access controlled by Vercel team membership. Use the minimum required role (Viewer cannot read secret values).
- **Kubernetes Secrets** — restrict access with RBAC. Only the `stellar-spend` ServiceAccount should be able to read `stellar-spend-secrets`.
- **CI secrets** — stored as GitHub Actions encrypted secrets. Only workflows in the same repository can read them. Rotate `SENTRY_AUTH_TOKEN` and `VERCEL_TOKEN` periodically.
- **`BASE_PRIVATE_KEY`** — treat this like a production private key. Never log it, never pass it as a CLI argument, never include it in error messages.

---

## Secret Scanning

The repository has `.gitignore` rules that exclude `.env*` files (except `.env.example`). Additionally:

- The `ErrorHandler` in `src/lib/error-handler.ts` sanitizes error messages to redact API keys, connection strings, and file paths before they appear in responses or logs.
- The startup validation in `src/lib/env.ts` prevents the server from starting if secrets are misconfigured.
- Run `./scripts/validate-secrets.sh` in CI to catch accidental placeholder values before deployment.
