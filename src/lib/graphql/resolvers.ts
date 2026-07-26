/**
 * GraphQL resolvers — public entry point.
 *
 * All resolver logic has been split into domain modules under
 * `src/lib/graphql/resolvers/`.  This file re-exports the composed resolver
 * map and subscription map so existing imports continue to work unchanged.
 *
 * Domains:
 *   - transactions  (`resolvers/transactions.ts`)
 *   - accounts/KYC  (`resolvers/accounts.ts`)
 *   - merchant/compliance (`resolvers/merchant.ts`)
 *   - webhooks/disputes   (`resolvers/webhooks.ts`)
 */

// Re-export for consumers that still import directly from this file.
export { resolvers, subscriptions } from './resolvers/index';

// Re-export the context type used across all domain modules.
export type { GraphQLContext } from './context';
