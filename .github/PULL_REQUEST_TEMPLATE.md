## Summary

<!-- What does this PR do? Why? Keep it to 2–3 sentences. -->

Closes #<!-- issue number(s) -->

---

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] CI / tooling
- [ ] Other: <!-- describe -->

---

## Checklist

### Code quality

- [ ] My code follows the project's TypeScript and React conventions
- [ ] No `any` types introduced without justification
- [ ] No secrets, credentials, or PII committed
- [ ] Linting passes — `npm run lint`
- [ ] Type-check passes — `npx tsc --noEmit`

### Tests

- [ ] Unit tests added / updated for new or changed logic
- [ ] Integration tests added / updated if an API route changed
- [ ] All existing tests pass — `npm test`
- [ ] E2E tests pass (if UI flows changed) — `npm run test:e2e`
- [ ] Mutation score not degraded for touched modules
- [ ] **New protected endpoint** — if this PR adds a new API route that requires authentication, a corresponding entry has been added to `PROTECTED_ENDPOINTS` in `src/test/integration/api-key-scope-regression.integration.test.ts` and the route scope is registered in `src/lib/api-keys/scopes.ts`

### Documentation

- [ ] Inline JSDoc / comments updated where relevant
- [ ] `docs/` updated if architecture, configuration, or user-facing behavior changed
- [ ] `CHANGELOG` entry added (if public-facing change)

### Accessibility (UI changes only)

- [ ] New interactive elements have accessible labels (`aria-label` / `aria-labelledby`)
- [ ] Focus management is correct (modals, drawers trap focus)
- [ ] Color contrast meets WCAG AA
- [ ] Keyboard navigation tested

### Security

- [ ] No environment variables with `NEXT_PUBLIC_` prefix contain secrets
- [ ] User input is validated and sanitized
- [ ] No new dependencies with unusual names (potential typosquatting)

---

## Screenshots / recordings

<!-- For UI changes, add before/after screenshots or a short GIF. -->

---

## Testing notes

<!-- Describe how you tested this. Include commands, steps, or any manual verification. -->

---

## Dependencies / follow-up work

<!-- List any PRs this depends on, or follow-up issues to be filed. -->

### Code Quality Checklist
- [ ] No commented-out code blocks
- [ ] No console.log statements (except in development)
- [ ] No TODO comments without linked issues
- [ ] Code follows project style guide
- [ ] All tests passing
