# Security Scanning Strategy

## Overview

Automated security scanning detects vulnerabilities, secrets, and compliance issues in the codebase.

## Scanning Tools

### 1. Dependency Scanning (npm audit)

Scans for known vulnerabilities in npm dependencies.

```bash
npm audit --audit-level=moderate
npm sbom --sbom-format cyclonedx --sbom-output sbom.json
```

**Thresholds**: Fails on moderate or higher severity vulnerabilities

### 2. SAST (Static Application Security Testing)

Uses ESLint with security plugins to detect code-level vulnerabilities.

```bash
npx eslint . --ext .ts,.tsx --plugin security
```

**Detects**:

- Object injection vulnerabilities
- Unsafe regex patterns
- Hardcoded secrets
- Insecure cryptography

### 3. Secret Scanning

TruffleHog scans for exposed secrets and credentials.

```bash
trufflehog filesystem . --only-verified
```

**Detects**:

- API keys
- Database credentials
- Private keys
- OAuth tokens

### 4. License Compliance

Ensures all dependencies use approved licenses.

```bash
license-checker --onlyAllow "MIT,Apache-2.0,BSD,ISC,MPL-2.0"
```

**Approved Licenses**:

- MIT
- Apache 2.0
- BSD
- ISC
- MPL 2.0

### 5. Container Image Scanning

Trivy scans Docker images for vulnerabilities.

```bash
trivy image stellar-spend:latest
```

**Severity Levels**: CRITICAL, HIGH

### 6. CodeQL Analysis

GitHub's CodeQL performs deep semantic analysis.

**Coverage**: JavaScript/TypeScript

## CI/CD Integration

Security scans run on:

- Every push to main/develop
- Every pull request
- Daily schedule (3 AM UTC)

## Handling Vulnerabilities

### Critical/High Severity

1. Create emergency patch
2. Deploy immediately
3. Notify security team
4. Post-incident review

### Medium Severity

1. Plan fix in next sprint
2. Add to backlog
3. Track in security dashboard

### Low Severity

1. Include in regular updates
2. Monitor for patterns

## Suppressing False Positives

### npm audit

```bash
npm audit --audit-level=moderate --ignore-scripts
```

### ESLint

```javascript
// eslint-disable-next-line security/detect-object-injection
const value = obj[key];
```

### TruffleHog

Add to `.trufflehog.json`:

```json
{
  "detectors": {
    "BasicAuth": false
  }
}
```

## Security Policies

See [SECURITY.md](../SECURITY.md) for:

- Vulnerability disclosure
- Security contact
- Patch policy
- Incident response

## Monitoring

- GitHub Security tab
- Dependabot alerts
- Security report artifacts
- Email notifications for critical issues
