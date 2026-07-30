import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, parse, validate } from 'graphql';
import { schema } from '@/lib/graphql';
import { resolvers, subscriptions } from '@/lib/graphql';
import { buildContext } from '@/lib/graphql';

function createContext(overrides?: Partial<ReturnType<typeof buildContext>>) {
  return {
    userId: 'test_user',
    isPremium: false,
    isAuthenticated: true,
    role: 'user' as const,
    ...overrides,
  };
}

describe('GraphQL Schema', () => {
  it('builds without error', () => {
    expect(schema).toBeDefined();
  });

  it('has expected query types', () => {
    const queryType = schema.getQueryType();
    expect(queryType).toBeDefined();
    const fields = queryType!.getFields();
    expect(fields).toHaveProperty('transaction');
    expect(fields).toHaveProperty('transactions');
    expect(fields).toHaveProperty('quote');
    expect(fields).toHaveProperty('currencies');
    expect(fields).toHaveProperty('institutions');
    expect(fields).toHaveProperty('rate');
    expect(fields).toHaveProperty('dispute');
    expect(fields).toHaveProperty('disputes');
    expect(fields).toHaveProperty('analyticsSummary');
    expect(fields).toHaveProperty('kycInfo');
    expect(fields).toHaveProperty('userLimits');
    expect(fields).toHaveProperty('screeningResult');
  });

  it('has expected mutation types', () => {
    const mutationType = schema.getMutationType();
    expect(mutationType).toBeDefined();
    const fields = mutationType!.getFields();
    expect(fields).toHaveProperty('createDispute');
    expect(fields).toHaveProperty('resolveDispute');
    expect(fields).toHaveProperty('addScreeningOverride');
    expect(fields).toHaveProperty('removeScreeningOverride');
    expect(fields).toHaveProperty('submitKYC');
    expect(fields).toHaveProperty('approveKYC');
    expect(fields).toHaveProperty('rejectKYC');
  });

  it('has expected subscription types', () => {
    const subscriptionType = schema.getSubscriptionType();
    expect(subscriptionType).toBeDefined();
    const fields = subscriptionType!.getFields();
    expect(fields).toHaveProperty('transactionStatusChanged');
    expect(fields).toHaveProperty('rateUpdated');
    expect(fields).toHaveProperty('transactionCreated');
    expect(fields).toHaveProperty('disputeStatusChanged');
    expect(fields).toHaveProperty('screeningAlert');
  });
});

describe('Auth guards', () => {
  it('rejects unauthenticated queries', async () => {
    const result = await graphql({
      schema,
      source: '{ currencies { code } }',
      rootValue: resolvers,
      contextValue: { userId: undefined, isPremium: false, isAuthenticated: false },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});

describe('Type definitions', () => {
  it('Transaction type has all expected fields', () => {
    const txType = schema.getType('Transaction') as any;
    expect(txType).toBeDefined();
    const fields = txType.getFields();
    expect(fields).toHaveProperty('id');
    expect(fields).toHaveProperty('status');
    expect(fields).toHaveProperty('amount');
    expect(fields).toHaveProperty('currency');
    expect(fields).toHaveProperty('beneficiary');
    expect(fields).toHaveProperty('stellarTxHash');
    expect(fields).toHaveProperty('payoutOrderId');
    expect(fields).toHaveProperty('reversal');
    expect(fields).toHaveProperty('insurance');
    expect(fields).toHaveProperty('tags');
    expect(fields).toHaveProperty('note');
    expect(fields).toHaveProperty('isFavorite');
  });

  it('Dispute type has all expected fields', () => {
    const disputeType = schema.getType('Dispute') as any;
    expect(disputeType).toBeDefined();
    const fields = disputeType.getFields();
    expect(fields).toHaveProperty('id');
    expect(fields).toHaveProperty('transactionId');
    expect(fields).toHaveProperty('reason');
    expect(fields).toHaveProperty('status');
    expect(fields).toHaveProperty('resolution');
    expect(fields).toHaveProperty('evidence');
  });

  it('AnalyticsSummary type has all expected fields', () => {
    const analyticsType = schema.getType('AnalyticsSummary') as any;
    expect(analyticsType).toBeDefined();
    const fields = analyticsType.getFields();
    expect(fields).toHaveProperty('totalTransactions');
    expect(fields).toHaveProperty('totalVolume');
    expect(fields).toHaveProperty('topCurrencies');
    expect(fields).toHaveProperty('volumeByDay');
  });

  it('ScreeningResult type has all expected fields', () => {
    const screeningType = schema.getType('ScreeningResult') as any;
    expect(screeningType).toBeDefined();
    const fields = screeningType.getFields();
    expect(fields).toHaveProperty('verdict');
    expect(fields).toHaveProperty('score');
    expect(fields).toHaveProperty('flags');
    expect(fields).toHaveProperty('provider');
    expect(fields).toHaveProperty('screenedAt');
  });

  it('KYCInfo and UserLimits types are defined', () => {
    expect(schema.getType('KYCInfo')).toBeDefined();
    expect(schema.getType('UserLimits')).toBeDefined();
  });
});

describe('Subscription resolvers', () => {
  it('transactionStatusChanged is an async generator', () => {
    const sub = subscriptions.transactionStatusChanged;
    expect(sub).toBeDefined();
    expect(typeof sub.subscribe).toBe('function');
  });

  it('rateUpdated is an async generator', () => {
    const sub = subscriptions.rateUpdated;
    expect(sub).toBeDefined();
    expect(typeof sub.subscribe).toBe('function');
  });

  it('transactionCreated is defined', () => {
    expect(subscriptions.transactionCreated).toBeDefined();
  });

  it('disputeStatusChanged is defined', () => {
    expect(subscriptions.disputeStatusChanged).toBeDefined();
  });

  it('screeningAlert is defined', () => {
    expect(subscriptions.screeningAlert).toBeDefined();
  });
});

describe('Schema validation', () => {
  it('validates a simple query', () => {
    const doc = parse('{ __typename }');
    const errors = validate(schema, doc);
    expect(errors).toHaveLength(0);
  });
});
