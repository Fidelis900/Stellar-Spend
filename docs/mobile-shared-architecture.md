# Mobile App Shared Code Architecture

## Overview

The Stellar Spend mobile app uses a monorepo structure to share code between web and mobile platforms.

## Structure

```
stellar-spend/
├── packages/
│   ├── shared/          # Platform-agnostic code
│   ├── web/             # Next.js web app (existing src/)
│   └── mobile/          # Expo mobile app
```

## Shared Package

Located in `packages/shared/`, contains:

- **Types** (`src/types/`): Transaction, Quote, Error types
- **Clients** (`src/clients/`): API clients (future)
- **Utils** (`src/utils/`): Pure utility functions (future)

## Mobile Package

Located in `packages/mobile/`, contains:

- **App.tsx**: Main application entry
- **app.json**: Expo configuration
- Deep linking scheme: `stellarspend://`

## Integration

Mobile app imports shared types:

```typescript
import { Transaction, Quote } from "@stellar-spend/shared";
```

## Next Steps

1. Extract API clients from `src/lib/clients` to `packages/shared/src/clients`
2. Move shared types to shared package
3. Implement mobile screens
4. Add deep linking handlers
5. Implement push notifications
