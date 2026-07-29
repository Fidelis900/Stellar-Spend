# Code Organization & Module Boundaries

## Module Map

```
src/
├── app/               # Next.js App Router (pages, API routes)
│   ├── api/           # API route handlers — thin wrappers, delegate to lib/
│   └── page.tsx       # Main UI page
├── components/        # React UI components
├── hooks/             # React hooks (useX pattern)
├── lib/               # Core business logic (no React)
│   ├── clients/       # HTTP clients for external APIs (Paycrest, Allbridge)
│   ├── services/      # Business services (quote, bridge, payout, etc.)
│   ├── offramp/       # Offramp domain: types, adapters, utils
│   │   ├── types/     # Domain types (re-exported via offramp/index.ts)
│   │   ├── adapters/  # Provider adapters
│   │   └── utils/     # Offramp utilities
│   ├── onramp/        # Onramp domain
│   ├── wallets/       # Wallet adapters (Freighter, Lobstr)
│   ├── types/         # Shared/branded types, discriminated unions
│   ├── validators/    # Input validation
│   ├── repositories/  # Data access layer
│   ├── db/            # Database client
│   ├── cache/         # Cache service
│   ├── events/        # Event bus
│   ├── webhook/       # Webhook delivery
│   ├── notifications/ # Notification service
│   ├── polling/       # Polling utilities
│   ├── middleware/    # API middleware (rate-limit, auth, etc.)
│   ├── security/      # Encryption, sanitization
│   ├── config/        # App configuration
│   ├── feature-flags/ # Feature flag evaluation
│   ├── errors/        # Custom error classes
│   ├── di/            # Dependency injection container
│   ├── ledger/        # Double-entry ledger
│   ├── stellar/       # Stellar-specific utilities
│   ├── graphql/       # GraphQL schema & resolvers
│   ├── api-keys/      # API key management
│   ├── api-versioning/# API version negotiation
│   ├── i18n/          # Internationalisation
│   └── index.ts       # Public barrel — only import lib via this
├── contexts/          # React contexts
├── types/             # Global TypeScript type declarations
└── data/              # Static data
```

## Boundary Rules

1. **App layer** (`src/app/`) imports from `@/lib` (via barrel), `@/components`, `@/hooks`
2. **Components** import from `@/lib` (via barrel), `@/hooks`, `@/contexts`, other `@/components`
3. **Hooks** import from `@/lib` (via barrel), `@/contexts`
4. **Lib modules** import from their own module OR from sibling modules via their barrel (`@/lib/services`, not `@/lib/services/payout.service`)
5. **No circular dependencies** between lib modules

## Cross-module Import Rule

Forbidden:

```ts
import { payoutService } from '@/lib/services/payout.service'; // deep import ❌
```

Allowed:

```ts
import { payoutService } from '@/lib/services'; // via barrel ✅
```

The ESLint `no-restricted-imports` rule enforces this for `src/app/`, `src/components/`, and `src/hooks/`.

## Adding a New Module

1. Create `src/lib/<module>/` directory
2. Add an `index.ts` that explicitly exports the public surface
3. Add the module to `src/lib/index.ts`
4. Document the module in this file
5. Add the barrel path to the `no-restricted-imports` ESLint rule
