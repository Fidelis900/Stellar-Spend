# Deployment Guide

This guide covers deploying Stellar-Spend to production on Vercel, including environment configuration, DNS setup, monitoring, and rollback procedures.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Vercel Deployment](#vercel-deployment)
4. [DNS and Domain Setup](#dns-and-domain-setup)
5. [Monitoring and Logging](#monitoring-and-logging)
6. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

- A [Vercel](https://vercel.com) account with the project imported
- A [Paycrest](https://paycrest.io) account with an API key and webhook secret
- A dedicated Base wallet (private key + public address) for payout execution
- A Base RPC provider URL (e.g. Alchemy, QuickNode, or `https://mainnet.base.org`)
- A Stellar Soroban RPC endpoint (e.g. `https://soroban-rpc.mainnet.stellar.gateway.fm`)
- (Optional) A [Sentry](https://sentry.io) project for error monitoring

---

## Environment Variables

All variables must be set in Vercel's **Environment Variables** settings (Settings → Environment Variables). Set them for the **Production** environment at minimum; mirror to Preview/Development as needed.

### Required — Server Only

These must **never** use the `NEXT_PUBLIC_` prefix. The app throws a startup error if they are missing or accidentally exposed.

| Variable                  | Description                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `PAYCREST_API_KEY`        | Paycrest API key from the Paycrest dashboard                                       |
| `PAYCREST_WEBHOOK_SECRET` | Webhook signing secret from Paycrest webhook settings                              |
| `BASE_PRIVATE_KEY`        | Private key of the Base wallet that signs payout transactions                      |
| `BASE_RETURN_ADDRESS`     | Public Base address for refunds/treasury routing                                   |
| `BASE_RPC_URL`            | Base mainnet RPC URL                                                               |
| `STELLAR_SOROBAN_RPC_URL` | Soroban RPC endpoint for server-side tx building                                   |
| `STELLAR_HORIZON_URL`     | Horizon endpoint for account/trustline lookups (use `https://horizon.stellar.org`) |

### Required — Public (Browser-Safe)

| Variable                              | Description                                            |
| ------------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL` | Soroban RPC endpoint exposed to the browser            |
| `NEXT_PUBLIC_BASE_RETURN_ADDRESS`     | Base return address shown to the browser               |
| `NEXT_PUBLIC_STELLAR_USDC_ISSUER`     | Stellar USDC issuer account (from Circle/Stellar docs) |

### Optional

| Variable                 | Description                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`             | Sentry DSN for server-side error tracking                                                                                                                                                      |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for browser-side error tracking                                                                                                                                                     |
| `SENTRY_ORG`             | Sentry org slug (required for source map uploads)                                                                                                                                              |
| `SENTRY_PROJECT`         | Sentry project slug (required for source map uploads)                                                                                                                                          |
| `SENTRY_AUTH_TOKEN`      | Sentry auth token for source map uploads during CI builds                                                                                                                                      |
| `ALLOWED_ORIGINS`        | Comma-separated list of allowed CORS origins (e.g. `https://your-app.vercel.app,https://www.your-domain.com`). When empty, only localhost origins are allowed — always set this in production. |
| `ANALYZE`                | Set to `true` to generate a bundle analysis report during build                                                                                                                                |

---

## Vercel Deployment

### First Deployment (Manual)

1. Install the Vercel CLI:

   ```bash
   npm i -g vercel
   ```

2. Link the project:

   ```bash
   vercel link
   ```

   Follow the prompts to connect to your Vercel org and project. This creates `.vercel/project.json` with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

3. Set all environment variables in the Vercel dashboard (Settings → Environment Variables) before deploying.

4. Deploy to production:
   ```bash
   vercel --prod
   ```

### Automated Deployment via GitHub Actions

The repository includes `.github/workflows/deploy.yml`. It triggers on every push to `main`, runs CI (lint + build + tests), then deploys to Vercel if CI passes.

Required GitHub Actions secrets (Settings → Secrets and variables → Actions):

| Secret              | Where to get it                              |
| ------------------- | -------------------------------------------- |
| `VERCEL_TOKEN`      | Vercel dashboard → Account Settings → Tokens |
| `VERCEL_ORG_ID`     | `.vercel/project.json` after `vercel link`   |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link`   |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens              |

The deploy job runs in the `production` GitHub environment. You can add required reviewers to that environment in Settings → Environments for an approval gate before production deploys.

### Build Configuration

The app uses `output: "standalone"` in `next.config.ts`, which Vercel handles automatically. No custom build command is needed — Vercel detects Next.js and runs `next build`.

The build fails if the `.next` output exceeds **150 MB**. Run `npm run build:analyze` locally to investigate bundle size before pushing.

---

## DNS and Domain Setup

### Adding a Custom Domain in Vercel

1. Go to your Vercel project → Settings → Domains.
2. Enter your domain (e.g. `app.your-domain.com`) and click Add.
3. Vercel will show the required DNS records.

### DNS Records

| Type    | Name       | Value                       |
| ------- | ---------- | --------------------------- |
| `A`     | `@` (apex) | `76.76.21.21` (Vercel's IP) |
| `CNAME` | `www`      | `cname.vercel-dns.com`      |

For a subdomain (e.g. `app.your-domain.com`):

| Type    | Name  | Value                  |
| ------- | ----- | ---------------------- |
| `CNAME` | `app` | `cname.vercel-dns.com` |

DNS propagation typically takes a few minutes to a few hours. Vercel provisions a TLS certificate automatically via Let's Encrypt once DNS resolves.

### Update CORS After Domain Change

Once your domain is live, set `ALLOWED_ORIGINS` in Vercel to your production origin(s):

```
ALLOWED_ORIGINS=https://app.your-domain.com,https://www.your-domain.com
```

Without this, the API will reject browser requests from your custom domain.

### Update Paycrest Webhook URL

In the Paycrest dashboard, update the webhook endpoint to:

```
https://app.your-domain.com/api/webhooks/paycrest
```

---

## Monitoring and Logging

### Sentry (Error Tracking)

Sentry is pre-configured in three files:

- `sentry.server.config.ts` — server-side (API routes, SSR)
- `sentry.client.config.ts` — browser
- `sentry.edge.config.ts` — edge runtime

Both use `tracesSampleRate: 0.1` (10% of transactions traced). Adjust this in the config files if you need more or less trace coverage.

To enable Sentry:

1. Create a project at [sentry.io](https://sentry.io).
2. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel.
3. Set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` for source map uploads.

Source maps are uploaded automatically during CI builds (`hideSourceMaps: true` keeps them off the CDN).

### Vercel Logs

- **Runtime logs**: Vercel dashboard → your project → Logs tab. Filter by function path (e.g. `/api/offramp/bridge/build-tx`).
- **Build logs**: Vercel dashboard → Deployments → select a deployment → Build Logs.

Structured log lines from API routes include a `requestId` field (set as `X-Request-Id` in responses) which you can use to correlate logs across a single request.

### Health Check

```bash
curl https://app.your-domain.com/api/health
# {"status":"ok","timestamp":"...","version":"0.1.0"}
```

Use this endpoint for uptime monitoring (e.g. UptimeRobot, Better Uptime). A non-200 response or missing `"status":"ok"` indicates the deployment is unhealthy.

---

## Rollback Procedures

### Instant Rollback via Vercel Dashboard

1. Go to your Vercel project → Deployments.
2. Find the last known-good deployment.
3. Click the `...` menu → **Promote to Production**.

This is instant — no rebuild required. The previous deployment's build artifacts are already cached.

### Rollback via CLI

```bash
# List recent deployments
vercel ls --prod

# Promote a specific deployment URL to production
vercel promote <deployment-url>
```

### Rollback via Git

If you need to revert the code as well:

```bash
# Revert the bad commit and push — triggers the deploy workflow automatically
git revert <bad-commit-sha>
git push origin main
```

Avoid `git reset --hard` + force push on `main` — it breaks the deployment history and other contributors' branches.

### Environment Variable Rollback

If a bad env var value caused the incident:

1. Go to Vercel → Settings → Environment Variables.
2. Edit the affected variable.
3. Trigger a redeploy: Vercel dashboard → Deployments → `...` → **Redeploy** on the last good deployment (this picks up the updated env vars with the old code).

### Verifying a Rollback

After promoting or redeploying:

```bash
# Check health
curl https://app.your-domain.com/api/health

# Confirm the deployed version matches expectations
# (version field comes from package.json)
```

Check Sentry for a drop in error rate within a few minutes of the rollback completing.

---

## Container Deployment

### Docker (Single Container)

Build and run the app as a Docker container:

```bash
# Build the image
docker build -t stellar-spend:latest .

# Run with env file
docker run -p 3000:3000 --env-file .env.local stellar-spend:latest
```

The container exposes port 3000 and includes a built-in health check that polls `/api/health` every 30 seconds.

### Docker Compose

For local development or single-host production:

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f app

# Stop
docker compose down
```

The `docker-compose.yml` mounts `.env.local` automatically and configures health checks and memory limits.

### Kubernetes

Manifests are in `k8s/deployment.yaml`. They create a `Deployment` (2 replicas) and a `ClusterIP` `Service`.

**Prerequisites:** a `stellar-spend-secrets` Kubernetes Secret containing all required env vars (see [Environment Variables](#environment-variables)).

```bash
# Create the secret from your .env.local
kubectl create secret generic stellar-spend-secrets --from-env-file=.env.local

# Apply manifests
kubectl apply -f k8s/deployment.yaml

# Check rollout
kubectl rollout status deployment/stellar-spend
```

The deployment uses liveness and readiness probes on `/api/health` so Kubernetes only routes traffic to healthy pods.
