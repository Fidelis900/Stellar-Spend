# Contributing to Stellar-Spend

## Dependency Updates

### Version Pinning Policy
- All critical dependencies are pinned to exact versions
- Loose semver ranges (`^`, `~`) are not allowed for critical deps
- Use exact versions: `"package": "1.2.3"` instead of `"package": "^1.2.3"`

### Critical Dependencies
- `next`
- `react` / `react-dom`
- `@stellar/stellar-sdk`
- `@sentry/nextjs`
- `typescript`
- `tailwindcss`

### Updating Dependencies
1. Review new version
2. Test locally
3. Update package.json
4. Commit with details
5. Update lockfile

### Security Updates
- Security patches within 24 hours
- Run `npm audit` regularly
