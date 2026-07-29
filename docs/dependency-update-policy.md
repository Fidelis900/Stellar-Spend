# Dependency Update Policy

## Overview

This document describes how Stellar-Spend manages third-party dependencies to reduce supply-chain risk while keeping the project current.

## Automated Updates (Renovate)

Renovate Bot runs on a weekly schedule and opens PRs automatically.

### Schedule

| Update type            | Schedule                         | Auto-merge               |
| ---------------------- | -------------------------------- | ------------------------ |
| Patch updates          | Monday before 06:00 UTC          | ✅ Yes (after CI passes) |
| Minor/major updates    | Monday before 06:00 UTC          | ❌ No — requires review  |
| Dev dependencies       | Monday before 06:00 UTC          | ✅ Yes                   |
| Lockfile maintenance   | First of month, before 04:00 UTC | ✅ Yes                   |
| Security/vulnerability | Immediately                      | ❌ No — requires review  |

### Grouped PRs

| Group               | Packages                             |
| ------------------- | ------------------------------------ |
| `stellar-core-deps` | `@stellar/*`, `@allbridge/*`, `viem` |
| `nextjs-react`      | `next`, `react`, `react-dom`         |
| `typescript-types`  | `@types/*`                           |
| `dev-dependencies`  | All `devDependencies`                |

### Configuration

See `.github/renovate.json` for the full Renovate configuration.

## CI Checks on Dependency PRs

Every dependency PR (Renovate or manual) must pass all of the following jobs in `vulnerability-scanning.yml`:

| Job                  | Purpose                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `lockfile-integrity` | Verifies `package-lock.json` is in sync and uses lockfileVersion ≥ 2 (includes integrity hashes) |
| `license-check`      | Fails on disallowed licenses (GPL, AGPL, LGPL, CDDL, EPL)                                        |
| `provenance-check`   | Runs `npm audit signatures` and flags typosquatting candidates                                   |
| `npm-audit`          | Fails on `moderate`+ vulnerabilities                                                             |
| `dependency-check`   | Snyk deep scan at `high` severity threshold                                                      |
| `container-scan`     | Trivy scan for HIGH/CRITICAL CVEs in the Docker image                                            |

## Disallowed Licenses

The following licenses are blocked in production dependencies:

- GPL-2.0, GPL-3.0
- AGPL-1.0, AGPL-3.0
- LGPL-2.0, LGPL-2.1, LGPL-3.0
- CDDL-1.0
- EPL-1.0, EPL-2.0

If a required package uses a disallowed license, raise it with the team lead before merging.

## Lockfile Integrity

- `package-lock.json` **must** be committed and kept in sync.
- `lockfileVersion` must be 2 or 3 (includes `integrity` SHA-512 hashes for every package).
- CI verifies the lockfile is not out of sync with `package.json` on every PR.
- Run `npm ci` (not `npm install`) in all CI jobs and Docker builds to use the locked versions.

## Responding to Vulnerability Alerts

1. **Critical/High**: Address within 48 hours. If no patch exists, evaluate mitigations or removal.
2. **Moderate**: Address within 2 weeks or next scheduled Renovate cycle.
3. **Low**: Address in the next Renovate batch.

Snyk and `npm audit` reports are uploaded as CI artifacts for each run.

## Manual Updates

When updating a dependency manually:

```bash
# Update a specific package to latest compatible version
npm install <package>@latest

# Commit both package.json and package-lock.json together
git add package.json package-lock.json
git commit -m "chore(deps): update <package> to vX.Y.Z"
```

Always run `npm test` and `npm run build` locally before pushing.

## References

- [Renovate config](.github/renovate.json)
- [Vulnerability scanning workflow](.github/workflows/vulnerability-scanning.yml)
- [SECURITY.md](../SECURITY.md)
