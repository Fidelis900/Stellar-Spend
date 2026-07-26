/**
 * Barrel for the domain-split GraphQL resolver modules.
 *
 * Usage:
 *   import { resolvers, subscriptions } from '@/lib/graphql/resolvers';
 *
 * Domains:
 *   - transactions  → queries/subscriptions for transactions, quotes, currencies, rates
 *   - accounts      → queries/mutations for KYC and user limits
 *   - merchant      → queries/mutations for compliance screening & analytics
 *   - webhooks      → queries/mutations for webhook deliveries, DLQ, and disputes
 */

export { transactionQueries, transactionSubscriptions } from './transactions';
export { accountQueries, accountMutations } from './accounts';
export { merchantQueries, merchantMutations, merchantSubscriptions } from './merchant';
export { webhookQueries, webhookMutations, webhookSubscriptions } from './webhooks';

import { transactionQueries, transactionSubscriptions } from './transactions';
import { accountQueries, accountMutations } from './accounts';
import { merchantQueries, merchantMutations, merchantSubscriptions } from './merchant';
import { webhookQueries, webhookMutations, webhookSubscriptions } from './webhooks';

/**
 * Combined resolver map passed as `rootValue` to the `graphql()` executor.
 */
export const resolvers = {
  Query: {
    ...transactionQueries,
    ...accountQueries,
    ...merchantQueries,
    ...webhookQueries,
  },
  Mutation: {
    ...accountMutations,
    ...merchantMutations,
    ...webhookMutations,
  },
};

/**
 * Subscription resolver map.
 */
export const subscriptions = {
  ...transactionSubscriptions,
  ...merchantSubscriptions,
  ...webhookSubscriptions,
};
