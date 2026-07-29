# Infrastructure

Stellar-Spend is deployed on **AWS ECS Fargate** using **Terraform** for infrastructure-as-code. The configuration lives in the [`terraform/`](../terraform/) directory.

## Table of Contents

- [Architecture overview](#architecture-overview)
- [Directory structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Environment parity](#environment-parity)
- [Secrets management](#secrets-management)
- [First-time setup](#first-time-setup)
- [Day-to-day operations](#day-to-day-operations)
- [CI/CD integration](#cicd-integration)
- [Resource reference](#resource-reference)

---

## Architecture overview

```
Internet
   │
   ▼
Application Load Balancer (public subnets, port 80/443)
   │
   ▼
ECS Fargate Service (private subnets)
   │  ├── Task: stellar-spend container (port 3000)
   │  │     ├── Env vars injected from Secrets Manager
   │  │     └── Logs → CloudWatch Logs
   │  └── Auto Scaling (CPU target 70%)
   │
   ▼
External APIs: Paycrest, Allbridge, Stellar, Base RPC
```

All containers run in **private subnets** and reach the internet via a NAT Gateway. The ALB sits in **public subnets** and is the only ingress point.

---

## Directory structure

```
terraform/
├── versions.tf          # Provider + backend configuration
├── variables.tf         # All input variables with descriptions
├── main.tf              # All AWS resources
├── outputs.tf           # Exported values (ALB DNS, cluster name, …)
├── envs/
│   ├── staging.tfvars   # Staging-specific variable values
│   └── production.tfvars# Production-specific variable values
└── scripts/
    └── validate.sh      # Local validation script (fmt + init + validate)
```

---

## Prerequisites

| Tool              | Version | Install                                                                            |
| ----------------- | ------- | ---------------------------------------------------------------------------------- |
| Terraform         | ≥ 1.6.0 | [terraform.io](https://developer.hashicorp.com/terraform/install)                  |
| AWS CLI           | ≥ 2.x   | [aws.amazon.com/cli](https://aws.amazon.com/cli/)                                  |
| tflint (optional) | latest  | [github.com/terraform-linters/tflint](https://github.com/terraform-linters/tflint) |

AWS credentials must be configured before running `terraform plan` or `apply`:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
```

A remote state backend (S3 + DynamoDB lock table) must exist before the first `init`. Create it once manually or with a bootstrap script:

```bash
aws s3api create-bucket --bucket my-tfstate --region us-east-1
aws dynamodb create-table \
  --table-name terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

## Environment parity

Two environments are defined, each with its own tfvars file:

| Setting                | Staging                   | Production     |
| ---------------------- | ------------------------- | -------------- |
| `desired_count`        | 1                         | 2              |
| `cpu`                  | 256 (0.25 vCPU)           | 512 (0.5 vCPU) |
| `memory`               | 512 MiB                   | 1024 MiB       |
| Capacity provider      | `FARGATE_SPOT`            | `FARGATE`      |
| Secret recovery window | 0 days (immediate delete) | 30 days        |
| Log retention          | 14 days                   | 90 days        |
| Auto-scaling max       | 4 tasks                   | 10 tasks       |
| VPC CIDR               | `10.1.0.0/16`             | `10.0.0.0/16`  |

Both environments use identical resource types and the same Terraform code — only the variable values differ.

---

## Secrets management

Sensitive values are stored in **AWS Secrets Manager** under the path `stellar-spend-<env>/app-secrets`. The secret is a JSON object with these keys:

| Key                       | Description                    |
| ------------------------- | ------------------------------ |
| `PAYCREST_API_KEY`        | Paycrest dashboard API key     |
| `PAYCREST_WEBHOOK_SECRET` | Paycrest webhook HMAC secret   |
| `BASE_PRIVATE_KEY`        | Base payout wallet private key |
| `DATABASE_URL`            | PostgreSQL connection string   |

Secrets are **never committed** to the repository. Supply them at plan/apply time via environment variables:

```bash
export TF_VAR_paycrest_api_key="..."
export TF_VAR_paycrest_webhook_secret="..."
export TF_VAR_base_private_key="0x..."
export TF_VAR_database_url="postgresql://..."
```

ECS tasks retrieve individual secret fields at startup using the `secrets` block in the task definition (no plaintext in environment variables at rest).

---

## First-time setup

### 1. Initialize the backend

```bash
cd terraform
terraform init \
  -backend-config="bucket=<your-tfstate-bucket>" \
  -backend-config="key=stellar-spend/staging/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=terraform-locks"
```

### 2. Plan

```bash
terraform plan -var-file=envs/staging.tfvars
```

### 3. Apply

```bash
terraform apply -var-file=envs/staging.tfvars
```

### 4. Note the outputs

```bash
terraform output alb_dns_name   # Point your DNS CNAME here
terraform output ecs_cluster_name
```

---

## Day-to-day operations

### Deploy a new image

Update `app_image` in the relevant tfvars file (or pass `-var`), then:

```bash
terraform apply -var-file=envs/staging.tfvars \
  -var="app_image=123456789.dkr.ecr.us-east-1.amazonaws.com/stellar-spend:v1.2.3"
```

ECS performs a rolling update with `deployment_minimum_healthy_percent = 50`.

### Scale manually

```bash
terraform apply -var-file=envs/production.tfvars -var="desired_count=4"
```

### Rotate a secret

Update the secret value in Secrets Manager (via console or CLI), then force a new ECS deployment to pick it up:

```bash
aws ecs update-service \
  --cluster stellar-spend-production \
  --service stellar-spend-production-svc \
  --force-new-deployment
```

### Destroy an environment

```bash
terraform destroy -var-file=envs/staging.tfvars
```

> ⚠️ Production has a 30-day secret recovery window. The Secrets Manager secret cannot be immediately re-created with the same name after destroy.

---

## CI/CD integration

The GitHub Actions workflow at [`.github/workflows/terraform.yml`](../.github/workflows/terraform.yml) runs automatically on any change to `terraform/**`:

| Job            | Trigger   | What it does                                    |
| -------------- | --------- | ----------------------------------------------- |
| `validate`     | push + PR | `fmt -check`, `init -backend=false`, `validate` |
| `plan-staging` | PR only   | Full `terraform plan` against staging state     |

Required GitHub repository secrets and variables:

| Name                      | Type     | Description                           |
| ------------------------- | -------- | ------------------------------------- |
| `AWS_ACCESS_KEY_ID`       | Secret   | IAM key for CI                        |
| `AWS_SECRET_ACCESS_KEY`   | Secret   | IAM secret for CI                     |
| `PAYCREST_API_KEY`        | Secret   | Passed to `terraform plan`            |
| `PAYCREST_WEBHOOK_SECRET` | Secret   | Passed to `terraform plan`            |
| `BASE_PRIVATE_KEY`        | Secret   | Passed to `terraform plan`            |
| `DATABASE_URL`            | Secret   | Passed to `terraform plan`            |
| `TF_STATE_BUCKET`         | Variable | S3 bucket name for Terraform state    |
| `TF_LOCK_TABLE`           | Variable | DynamoDB table name for state locking |
| `AWS_REGION`              | Variable | AWS region (e.g. `us-east-1`)         |

### Local validation

```bash
./terraform/scripts/validate.sh
```

---

## Resource reference

| Resource             | Name pattern                         | Notes                                        |
| -------------------- | ------------------------------------ | -------------------------------------------- |
| VPC                  | `stellar-spend-<env>-vpc`            | Dedicated per environment                    |
| Public subnets (×2)  | `stellar-spend-<env>-public-{1,2}`   | ALB placement                                |
| Private subnets (×2) | `stellar-spend-<env>-private-{1,2}`  | ECS task placement                           |
| NAT Gateway          | `stellar-spend-<env>-nat`            | Single NAT (cost optimised)                  |
| ALB                  | `stellar-spend-<env>-alb`            | HTTP→HTTPS redirect; HTTPS requires ACM cert |
| ECS Cluster          | `stellar-spend-<env>`                | Container Insights enabled                   |
| ECS Service          | `stellar-spend-<env>-svc`            | Rolling deploy, CPU autoscaling              |
| Task Definition      | `stellar-spend-<env>`                | Fargate, awsvpc networking                   |
| Secrets Manager      | `stellar-spend-<env>/app-secrets`    | JSON with 4 secret keys                      |
| CloudWatch Log Group | `/ecs/stellar-spend-<env>`           | 14d staging / 90d production                 |
| IAM Execution Role   | `stellar-spend-<env>-task-execution` | Pulls image + reads secrets                  |
| IAM Task Role        | `stellar-spend-<env>-task`           | App runtime permissions                      |
