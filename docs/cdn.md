# CDN Setup — CloudFront

Stellar-Spend uses Amazon CloudFront as its CDN to serve static assets globally with low latency and to terminate TLS at the edge.

---

## Architecture

```
Browser → CloudFront (edge) → ALB → ECS Fargate (Next.js)
```

- **Static assets** (`/_next/static/*`, `/static/*`, `/icons/*`) are cached at the edge for 1 year (immutable).
- **Pages** are cached for up to 1 hour with short TTLs.
- **Reference-data API routes** (`/api/offramp/currencies`, `/api/offramp/institutions/*`) use `max-age=3600, stale-while-revalidate=86400` — fresh for 1 hour, then served stale while the origin revalidates in the background.
- **Other API routes** (`/api/*`) bypass the cache entirely — all requests are forwarded to the origin.
- A **CloudFront Function** injects security headers (`HSTS`, `X-Frame-Options`, etc.) on every response.

---

## Terraform resources

All CDN infrastructure is defined in [`terraform/cloudfront.tf`](../terraform/cloudfront.tf).

| Resource | Purpose |
|---|---|
| `aws_cloudfront_distribution.main` | Main distribution, ALB as origin |
| `aws_cloudfront_cache_policy.static_assets` | 1-year immutable cache for `_next/static` |
| `aws_cloudfront_cache_policy.pages` | Short TTL (60 s default, 1 h max) for pages |
| `aws_cloudfront_cache_policy.no_cache` | Zero TTL for API routes |
| `aws_cloudfront_origin_request_policy.alb_forward` | Forwards required headers to ALB |
| `aws_cloudfront_function.security_headers` | Injects HSTS and other security headers |
| `aws_s3_bucket.cf_logs` | Stores CloudFront access logs |
| `null_resource.cf_invalidation` | Triggers a `/*` invalidation on deploy |
| `aws_cloudwatch_metric_alarm.cf_5xx_rate` | Alarm when 5xx rate > 5% |
| `aws_cloudwatch_metric_alarm.cf_4xx_rate` | Alarm when 4xx rate > 10% |
| `aws_cloudwatch_metric_alarm.cf_origin_latency` | Alarm when p99 origin latency > 3 s |

---

## Variables

Add these to your `terraform/envs/<env>.tfvars` or supply via `TF_VAR_*` environment variables.

| Variable | Default | Description |
|---|---|---|
| `cf_price_class` | `PriceClass_100` | Edge locations: `PriceClass_100` (US/EU), `PriceClass_200` (+ Asia), `PriceClass_All` |
| `cf_domain_aliases` | `[]` | Custom domains (e.g. `["cdn.example.com"]`). Requires `cf_acm_certificate_arn`. |
| `cf_acm_certificate_arn` | `""` | ACM certificate ARN in **us-east-1** for custom domains |
| `cf_origin_secret` | — | Shared secret sent as `X-CloudFront-Secret` header to the ALB |
| `cf_geo_restriction_type` | `blacklist` | `whitelist` or `blacklist` |
| `cf_geo_restriction_locations` | `[]` | ISO 3166-1 alpha-2 country codes. Empty = no restriction |
| `cf_invalidation_trigger` | `initial` | Bump to force a cache invalidation on next `terraform apply` |
| `alarm_sns_arn` | `""` | SNS topic ARN for CloudWatch alarm notifications |

---

## Outputs

After `terraform apply`, the following outputs are available:

| Output | Description |
|---|---|
| `cloudfront_distribution_id` | Distribution ID — use for manual invalidations |
| `cloudfront_domain_name` | Default CF domain (e.g. `https://d1234.cloudfront.net`) |
| `cloudfront_hosted_zone_id` | Hosted zone ID for Route 53 alias records |
| `cf_logs_bucket` | S3 bucket name for access logs |

---

## Environment variable

Set `NEXT_PUBLIC_CDN_URL` to the CloudFront domain so Next.js serves static assets from the CDN:

```bash
# .env.local (or ECS task environment)
NEXT_PUBLIC_CDN_URL=https://d1234.cloudfront.net
```

The value is automatically available from Terraform:

```bash
terraform output cloudfront_domain_name
```

---

## Deploying

### First deploy

```bash
cd terraform
terraform init
terraform apply -var-file=envs/staging.tfvars \
  -var="cf_origin_secret=$CF_ORIGIN_SECRET" \
  -var="paycrest_api_key=$PAYCREST_API_KEY" \
  # ... other secrets
```

### Custom domain (optional)

1. Create an ACM certificate in **us-east-1** for your CDN domain.
2. Set `cf_domain_aliases = ["cdn.example.com"]` and `cf_acm_certificate_arn = "arn:aws:acm:..."`.
3. Create a Route 53 CNAME or alias record pointing to `cloudfront_domain_name`.

### Cache invalidation

Invalidations run automatically on every `terraform apply` when `cf_invalidation_trigger` changes.

To invalidate manually:

```bash
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw cloudfront_distribution_id) \
  --paths "/*"
```

To trigger via Terraform, bump the variable:

```bash
terraform apply -var="cf_invalidation_trigger=$(date +%s)" -var-file=envs/staging.tfvars
```

---

## Reference-data edge caching

Rarely-changing reference data (currencies, institution lists) is served with long-lived edge caching to reduce origin load and improve cold-load latency.

| Endpoint | Cache-Control | Rationale |
|---|---|---|
| `GET /api/offramp/currencies` | `public, max-age=3600, stale-while-revalidate=86400` | Currency list changes only on corridor updates |
| `GET /api/offramp/institutions/[currency]` | `public, max-age=3600, stale-while-revalidate=86400` | Institution list is stable between corridor deploys |

**Invalidation:** When a corridor or config change is deployed, trigger a CloudFront invalidation for the affected paths:

```bash
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw cloudfront_distribution_id) \
  --paths "/api/offramp/currencies" "/api/offramp/institutions/*"
```

This can be wired into the CI/CD pipeline alongside corridor config changes.

---

## Security

### Origin protection

The ALB only accepts requests that include the `X-CloudFront-Secret` header. Configure an ALB listener rule to block requests missing this header:

```hcl
# Add to main.tf ALB listener rule
condition {
  http_header {
    http_header_name = "X-CloudFront-Secret"
    values           = [var.cf_origin_secret]
  }
}
```

### TLS

- CloudFront enforces HTTPS (`redirect-to-https` viewer protocol policy).
- Minimum TLS version: **TLSv1.2_2021** when using custom domains.
- HSTS header (`max-age=63072000; includeSubDomains; preload`) is injected by the CloudFront Function.

### Geo-restrictions

To block specific countries, set:

```hcl
cf_geo_restriction_type      = "blacklist"
cf_geo_restriction_locations = ["KP", "IR", "CU"]
```

To allow only specific countries (whitelist mode):

```hcl
cf_geo_restriction_type      = "whitelist"
cf_geo_restriction_locations = ["NG", "KE", "GH", "US", "GB"]
```

---

## Monitoring

Three CloudWatch alarms are created automatically:

| Alarm | Threshold | Action |
|---|---|---|
| `cf-5xx-rate` | > 5% for 10 min | SNS notification |
| `cf-4xx-rate` | > 10% for 15 min | SNS notification |
| `cf-origin-latency` | p99 > 3 s for 10 min | SNS notification |

Set `alarm_sns_arn` to receive notifications. CloudFront metrics are published to the `us-east-1` region under the `AWS/CloudFront` namespace.

Access logs are stored in the `<env>-cf-logs` S3 bucket and expire after 90 days (production) or 30 days (staging).
