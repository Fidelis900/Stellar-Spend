# Contributing to Stellar-Spend

Thank you for your interest in contributing! This document covers everything you need to know: environment setup, branch and commit conventions, the pull request process, the definition of done, and review SLAs.

> **New here?** Start with the [Developer Onboarding Guide](./docs/onboarding.md) — it takes you from clone to a running local environment and explains the architecture in detail.

---

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Branch Naming Conventions](#branch-naming-conventions)
3. [Commit Message Format](#commit-message-format)
4. [Pull Request Process](#pull-request-process)
5. [Definition of Done](#definition-of-done)
6. [Review Process & SLAs](#review-process--slas)
7. [Code Style Guidelines](#code-style-guidelines)
8. [Project Structure](#project-structure)
9. [Security & Audits](#security--audits)
10. [Getting Help](#getting-help)
11. [Code of Conduct](#code-of-conduct)

---

## Development Environment Setup

### Prerequisites

- Node.js ≥ 20 and npm
- Git
- A Stellar wallet (Freighter or Lobstr) on Mainnet for manual testing

### Getting started

```bash
# 1. Fork and clone
git clone https://github.com/your-username/stellar-spend.git
cd stellar-spend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in .env.local — see docs/environment-variables.md

# 4. Start the dev server
npm run dev
# Open http://localhost:3001
```

### Run checks before committing

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npx tsc --noEmit      # TypeScript
npm test              # Unit + integration tests
```

### Contract development (Soroban smart contracts)

If you modify files in the `contracts/` directory, you must:

1. **Fix Clippy warnings** – ensure no linting issues:
```bash
cd contracts
cargo clippy --workspace -- -D warnings
```

2. **Audit Rust dependencies** for security vulnerabilities:

```bash
# Option 1: Use the provided audit script
./scripts/audit-contracts.sh

# Option 2: Run cargo-audit directly on a specific contract
cd contracts/fee-manager
cargo audit --deny warnings
```

**Prerequisites for contract development:**
- Rust toolchain (install from https://rustup.rs/)
- `cargo-clippy` (included with rustup)
- `cargo-audit` for vulnerability scanning (install with `cargo install cargo-audit`)

**Set up local pre-commit hooks (optional but recommended):**
```bash
pip install pre-commit
pre-commit install
# Now cargo audit will run automatically before commits that touch Cargo.toml files
```

**Common workflows before pushing contract changes:**
- Run clippy: `cargo clippy --workspace -- -D warnings`
- Audit for vulnerabilities: `./scripts/audit-contracts.sh`
- Check for RUSTSEC advisories: `cargo audit --json` (for CI/CD integration)
- Update vulnerable dependencies: `cargo update`

### Component development

We use Storybook for isolated component development:

```bash
npm run storybook
```

When creating or updating a UI component, add a `.stories.tsx` file covering:
- Different variants and states (loading, disabled, error)
- Edge cases for input data
- Accessibility checks via the integrated `axe` addon

---

## Branch Naming Conventions

Use descriptive branch names with these prefixes:

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation updates |
| `style/` | Formatting / whitespace only |
| `refactor/` | Refactoring without behavior change |
| `test/` | Adding or updating tests |
| `chore/` | Maintenance, dependency updates |
| `ci/` | CI/CD changes |
| `contract/` | Soroban smart contract changes |

**Examples:**
- `feat/add-kes-corridor`
- `fix/paycrest-webhook-hmac`
- `docs/update-adr-escrow`
- `test/bridge-adapter-unit-tests`

Include the issue number when relevant: `feat/issue-42-add-kes-corridor`.

---

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace |
| `refactor` | Code restructuring, no behavior change |
| `test` | Adding or updating tests |
| `chore` | Maintenance, dependency bumps |
| `ci` | CI/CD configuration |
| `perf` | Performance improvement |
| `contract` | Soroban contract change |

### Scope (optional)

Use a scope to identify the affected subsystem:

`feat(bridge): …`, `fix(paycrest): …`, `test(wallet): …`, `docs(adr): …`

### Examples

```
feat(corridor): add KES fiat corridor via Paycrest
fix(webhook): validate HMAC signature before processing payload
docs(adr): add ADR-007 for feature flag approach
test(quote): add boundary tests for fee calculation
chore(deps): bump @stellar/stellar-sdk from 14.5.0 to 14.6.0
```

### Breaking changes

Add `BREAKING CHANGE:` in the footer:

```
feat(api)!: rename /api/offramp/rate to /api/offramp/fx-rate

BREAKING CHANGE: The old endpoint path is removed. Update all clients.
```

---

## Pull Request Process

### Before opening a PR

1. Make sure your branch is up to date with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Run the full check suite:
   ```bash
   npm run lint && npm run format:check && npx tsc --noEmit && npm test
   ```

3. If you changed UI flows, run E2E tests:
   ```bash
   npm run test:e2e
   ```

### Opening a PR

- Use the **PR template** (`.github/PULL_REQUEST_TEMPLATE.md`) — fill every section
- Title must follow the commit message format: `feat(scope): short description`
- Reference the issue: `Closes #<n>` in the summary
- Add screenshots or recordings for any UI changes
- Keep PRs focused — one concern per PR; split large changes

### Keeping a PR up to date

Rebase (do not merge) to stay current with `main`. Force-push to your branch is acceptable during review.

### Merging

PRs are merged by a maintainer using **squash and merge** once all checks pass and approval is received. Do not merge your own PRs.

---

## Definition of Done

A contribution is **done** when **all** of the following are true:

### Code
- [ ] Implements the acceptance criteria from the linked issue
- [ ] No regressions introduced (all existing tests still pass)
- [ ] No TypeScript errors: `npx tsc --noEmit` exits 0
- [ ] No lint errors: `npm run lint` exits 0
- [ ] No Prettier violations: `npm run format:check` exits 0
- [ ] No `any` types without a comment explaining why
- [ ] No secrets, PII, or credentials in the diff

### Tests
- [ ] New logic has unit tests covering the happy path and primary error paths
- [ ] Changed API routes have integration tests
- [ ] UI changes have component tests (render states + key interactions)
- [ ] Mutation score for touched modules is not degraded (target ≥ 70%)
- [ ] All CI test jobs pass (lint, type-check, unit, build, E2E)

### Accessibility (UI changes)
- [ ] New interactive elements have accessible names
- [ ] Focus management is correct (modals trap focus, focus restores on close)
- [ ] Keyboard navigation works without a mouse
- [ ] Color contrast ≥ 4.5:1 for text (WCAG AA)

### Documentation
- [ ] `docs/` updated if architecture, API behavior, or configuration changed
- [ ] If the architecture changed (new service, new external dependency, data-flow change): update `docs/diagrams/` source files and run the diagram check (`bash scripts/check-diagrams.sh`)
- [ ] New environment variables are added to `.env.example` with descriptions
- [ ] New ADRs created for significant architectural decisions (see `docs/adr/`)
- [ ] In-code comments are accurate and not stale

### Security
- [ ] No `NEXT_PUBLIC_` prefix on server-side secrets
- [ ] All user input is validated and sanitized
- [ ] New dependencies are from well-known, actively maintained packages
- [ ] New API endpoints enforce appropriate rate limits and authentication

---

## Review Process & SLAs

### Who reviews?

- **Maintainers** (`@Lex-Studios/maintainers`) review all PRs
- **Domain reviewers**: tag the relevant area owner for complex changes (see `CODEOWNERS` when present)

### Review SLAs

| PR size | First review | Follow-up response |
|---------|-------------|-------------------|
| Small (< 100 lines changed) | 2 business days | 1 business day |
| Medium (100–500 lines) | 3 business days | 2 business days |
| Large (> 500 lines) | 5 business days | 2 business days |
| Security fix / hotfix | Same day (tag `urgent`) | 4 hours |

SLAs are for the first substantive review. Trivial approvals (docs typo) may be faster.

### What reviewers look for

1. **Correctness** — Does it solve the stated problem? Are edge cases handled?
2. **Tests** — Are the tests meaningful? Do they cover failure paths?
3. **Security** — Are there any injection, auth bypass, or secret-exposure risks?
4. **Performance** — Any N+1 queries, unnecessary re-renders, or bundle bloat?
5. **Accessibility** — Are ARIA labels and keyboard flows correct?
6. **Definition of done** — All checklist items satisfied?

### Response to review comments

- Address all reviewer comments or explain why you disagree
- Mark conversations as resolved only after the fix is pushed
- Request a re-review once all comments are addressed
- Maintainers resolve conversations they opened

### Approval policy

- 1 approval from a maintainer is required to merge
- Security-sensitive changes (auth, encryption, smart contracts) require 2 approvals

---

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Define explicit types and interfaces; avoid `any`
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use branded types (`UserId`, `TransactionId`) for domain IDs (see `src/lib/types/branded-types.ts`)

### React / Next.js

- Functional components with hooks only
- Use `'use client'` directive only where client-side state/effects are needed
- Implement error boundaries around complex component trees
- Always provide loading and error states for async operations

### Environment variables

- Use `src/lib/env.ts` for all environment access
- Never import server-side variables in `'use client'` components
- Add new variables to `.env.example` with a description comment

### Formatting

- **Prettier** is enforced; run `npm run format` to auto-fix
- Single quotes for strings
- 100-character line limit
- Trailing commas in multi-line structures

### Naming

- Components: `PascalCase`
- Functions and variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case.ts` / `PascalCase.tsx` for components

---

## Project Structure

```
src/
├── app/                 # Next.js App Router pages and API routes
│   ├── api/            # REST API route handlers
│   └── history/        # /history page
├── components/         # Reusable React components
│   ├── design-system/  # Base design tokens (Button, Card, Badge, Alert)
│   ├── skeletons/      # Loading skeleton variants
│   └── ui/             # Primitive form components
├── hooks/              # Custom React hooks
├── lib/                # Core business logic and utilities
│   ├── i18n/           # Internationalisation
│   ├── offramp/        # Offramp-specific logic and adapters
│   ├── security/       # Encryption, sanitization, headers
│   ├── stellar/        # Stellar / Soroban wallet adapters
│   └── wallets/        # Multi-wallet manager
├── test/               # Unit and integration test files
│   ├── integration/    # Route-level integration tests
│   └── mocks/          # MSW handlers and shared test fixtures
└── types/              # Global TypeScript type definitions

e2e/                     # Playwright end-to-end tests
contracts/               # Soroban smart contracts (Rust)
  ├── escrow/
  ├── fee-manager/
  └── treasury/
docs/
  ├── adr/              # Architecture Decision Records
  └── *.md              # Reference documentation
.github/
  ├── ISSUE_TEMPLATE/   # Bug, feature, and contract issue templates
  └── PULL_REQUEST_TEMPLATE.md
```

---

## Getting Help

- Search [existing issues](https://github.com/Lex-Studios/Stellar-Spend/issues) first
- Open a [new issue](https://github.com/Lex-Studios/Stellar-Spend/issues/new/choose) using the appropriate template
- Join community discussions
- Review the [docs/](./docs/) directory for architecture and API references

---

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to its terms.

Thank you for contributing to Stellar-Spend! 🚀
