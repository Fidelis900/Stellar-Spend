# Contributing to Stellar-Spend

## Scratch Files

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
9. [Type Coverage](#type-coverage)
10. [Dependency License Compliance](#dependency-license-compliance)
11. [Security & Audits](#security--audits)
12. [Getting Help](#getting-help)
13. [Code of Conduct](#code-of-conduct)

---

## Development Environment Setup

> 📘 **Comprehensive Local Setup Guide**: For a consolidated guide covering Rust, Soroban CLI, database setup, and troubleshooting RPC errors, see **[`docs/local-dev-setup.md`](./docs/local-dev-setup.md)**.

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

### Creating Scratch Files
```bash
npm run lint             # ESLint
npm run format:check     # Prettier
npx tsc --noEmit         # TypeScript (zero errors required)
npm test                 # Unit + integration tests
npm run type:coverage    # Type coverage ≥ 95% (see § Type Coverage below)
npm run license:check    # Dependency-license compliance (see § Licenses below)
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

The project supports two pre-commit hook systems. Either one will enforce lint, TypeScript type-check, and formatting checks before each commit.

**Option A — pre-commit framework (Python):**

```bash
pip install pre-commit
pre-commit install
```

**Option B — Husky (native Git hooks):**

```bash
npm install
npx husky install
npx husky add .husky/pre-commit "npm run lint && npm run type:check && npm run format:check"
```

The pre-commit hooks run:
1. `npm run lint` — ESLint checks
2. `npm run type:check` — TypeScript type-checking (`tsc --noEmit`)
3. `npm run format:check` — Prettier formatting check

**Bypassing pre-commit hooks:**

To skip hooks for a specific commit (e.g., emergency fix, WIP commit), use the `--no-verify` flag:

```bash
git commit --no-verify -m "WIP: temporary change"
```

> **Warning**: `--no-verify` bypasses all pre-commit checks. CI will still enforce lint, type-check, and format on every push. Use this flag sparingly and never for code that will be merged without review.

**Common workflows before pushing contract changes:**

- **Format code**: `cargo fmt --workspace` (auto-fix) — style is enforced by CI
- **Check formatting**: `cargo fmt --workspace --check` (read-only, matches CI check)
- Run clippy: `cargo clippy --workspace -- -D warnings`
- Audit for vulnerabilities: `./scripts/audit-contracts.sh`
- Check for RUSTSEC advisories: `cargo audit --json` (for CI/CD integration)
- Update vulnerable dependencies: `cargo update`

### Rust code style (`rustfmt`)

All Soroban contract code is formatted with **rustfmt** using the rules in
[`contracts/rustfmt.toml`](./contracts/rustfmt.toml). Key settings:

| Rule            | Value                   |
| --------------- | ----------------------- |
| Edition         | 2021                    |
| Max line width  | 100                     |
| Indent          | 4 spaces (no hard tabs) |
| Import grouping | `StdExternalCrate`      |
| Trailing commas | Vertical (multi-line)   |
| Newline style   | Unix                    |

CI runs `cargo fmt --workspace --check` on every push that touches `contracts/`.
**A formatting diff will fail the build.** Run `cargo fmt --workspace` locally
before pushing to keep the check green.

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

| Prefix      | Purpose                             |
| ----------- | ----------------------------------- |
| `feat/`     | New features                        |
| `fix/`      | Bug fixes                           |
| `docs/`     | Documentation updates               |
| `style/`    | Formatting / whitespace only        |
| `refactor/` | Refactoring without behavior change |
| `test/`     | Adding or updating tests            |
| `chore/`    | Maintenance, dependency updates     |
| `ci/`       | CI/CD changes                       |
| `contract/` | Soroban smart contract changes      |

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

| Type       | When to use                            |
| ---------- | -------------------------------------- |
| `feat`     | New feature                            |
| `fix`      | Bug fix                                |
| `docs`     | Documentation only                     |
| `style`    | Formatting, whitespace                 |
| `refactor` | Code restructuring, no behavior change |
| `test`     | Adding or updating tests               |
| `chore`    | Maintenance, dependency bumps          |
| `ci`       | CI/CD configuration                    |
| `perf`     | Performance improvement                |
| `contract` | Soroban contract change                |

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

| PR size                     | First review            | Follow-up response |
| --------------------------- | ----------------------- | ------------------ |
| Small (< 100 lines changed) | 2 business days         | 1 business day     |
| Medium (100–500 lines)      | 3 business days         | 2 business days    |
| Large (> 500 lines)         | 5 business days         | 2 business days    |
| Security fix / hotfix       | Same day (tag `urgent`) | 4 hours            |

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

## Type Coverage

TypeScript type coverage is measured with [type-coverage](https://github.com/plantain-00/type-coverage)
and must stay at or above **95%**.

```bash
npm run type:coverage         # check (matches CI)
npm run type:coverage:detail  # show all uncovered identifiers
```

Configuration lives in `.type-coverage` at the project root.

### What the threshold means

| Score | Meaning                                                     |
| ----- | ----------------------------------------------------------- |
| ≥ 95% | ✅ Green — CI passes                                        |
| < 95% | ❌ Red — CI fails; you must improve coverage before merging |

### Justifying an `any` exception

If you genuinely cannot type something (e.g., a third-party response with no TS
definitions), add a comment directly above the line:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- no types available for XYZ SDK response
const result = sdk.call() as any;
```

The comment must name **why** `any` is unavoidable. Unexplained `any` usages
will be flagged in code review.

---

## Dependency License Compliance

All npm dependencies must carry a license from the **approved list** below.
Run the compliance check before opening a PR:

```bash
npm run license:check   # exits 0 if all clear, 1 on violation
npm run license:report  # same but also prints every approved package
```

### Approved licenses

| License                    | Notes                                                       |
| -------------------------- | ----------------------------------------------------------- |
| MIT, MIT-0                 | Permissive                                                  |
| ISC                        | Permissive                                                  |
| Apache-2.0                 | Permissive                                                  |
| BSD-2-Clause, BSD-3-Clause | Permissive                                                  |
| CC0-1.0, 0BSD              | Effectively public domain                                   |
| BlueOak-1.0.0              | Permissive                                                  |
| MPL-2.0                    | Weak copyleft — changes to MPL _files_ must be open-sourced |
| Unlicense, Public Domain   | Permissive                                                  |

### LGPL and GPL packages (currently accepted with rationale)

Several transitive dependencies (via `@allbridge/bridge-core-sdk`) carry
LGPL-3.0 or GPL-3.0 licenses. These are documented with a written rationale in
`scripts/check-licenses.js` under `ACCEPTED_EXCEPTIONS`. The key point: these
packages are **used as libraries** with no source modification — the LGPL
dynamic-linking exemption applies and the MIT application code is not infected.

Review these exceptions every time the affected packages are upgraded.

### Adding a new dependency with an unapproved license

1. Check whether a compatible alternative exists — prefer it.
2. If unavoidable, add an entry to `ACCEPTED_EXCEPTIONS` in
   `scripts/check-licenses.js` with:
   - The exact `package@version` key
   - A one-sentence rationale (why it is safe, what the linking model is)
3. Re-run `npm run license:check` to confirm the check still passes.
4. Note the exception in your PR description.

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
