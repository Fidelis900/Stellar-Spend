import { buildSchema } from 'graphql';

export const typeDefs = `
  # ─── Core Domain Types ────────────────────────────────────────────────────────

  type Transaction {
    id: ID!
    status: String!
    amount: String!
    currency: String!
    destinationAmount: String
    rate: Float
    bridgeFee: String
    payoutFee: String
    networkFee: String
    totalFee: String
    feeMethod: String
    createdAt: String!
    updatedAt: String!
    finalizedAt: String
    stellarTxHash: String
    bridgeStatus: String
    payoutOrderId: String
    payoutStatus: String
    userAddress: String!
    beneficiary: Beneficiary
    reversal: ReversalInfo
    insurance: InsuranceInfo
    tags: [Tag!]
    note: String
    isFavorite: Boolean
    error: String
  }

  type Beneficiary {
    institution: String!
    accountIdentifier: String!
    accountName: String
    currency: String!
  }

  type ReversalInfo {
    id: ID!
    amount: String!
    reason: String!
    status: String!
    createdAt: String!
  }

  type InsuranceInfo {
    premium: Float!
    coverage: Float!
    provider: String!
    status: String!
    purchasedAt: String!
  }

  type Tag {
    id: ID!
    name: String!
    color: String!
  }

  type Quote {
    destinationAmount: String!
    rate: Float!
    currency: String!
    bridgeFee: String!
    payoutFee: String!
    estimatedTime: Int!
    validUntil: String
    sourceAmount: String
  }

  type Currency {
    code: String!
    name: String!
    symbol: String!
    flag: String
    minAmount: Float
    maxAmount: Float
    decimals: Int
  }

  type Institution {
    id: String!
    name: String!
    code: String!
    currency: String!
    type: String
  }

  type RateInfo {
    rate: Float!
    currency: String!
    updatedAt: String!
  }

  # ─── Dispute Types ────────────────────────────────────────────────────────────

  type Dispute {
    id: ID!
    transactionId: String!
    userId: String!
    reason: String!
    status: String!
    resolution: String
    resolvedBy: String
    createdAt: String!
    updatedAt: String!
    resolvedAt: String
    evidence: [String!]
  }

  # ─── Analytics Types ──────────────────────────────────────────────────────────

  type AnalyticsSummary {
    totalTransactions: Int!
    totalVolume: String!
    completedTransactions: Int!
    failedTransactions: Int!
    pendingTransactions: Int!
    averageTransactionValue: String!
    topCurrencies: [CurrencyVolume!]!
    volumeByDay: [DailyVolume!]!
    periodStart: String!
    periodEnd: String!
  }

  type CurrencyVolume {
    currency: String!
    count: Int!
    volume: String!
  }

  type DailyVolume {
    date: String!
    count: Int!
    volume: String!
  }

  # ─── KYC / Compliance Types ──────────────────────────────────────────────────

  type KYCInfo {
    userId: String!
    status: String!
    documentType: String
    submittedAt: String!
    verifiedAt: String
    rejectionReason: String
  }

  type UserLimits {
    userId: String!
    tier: String!
    dailyLimit: Float!
    monthlyLimit: Float!
    transactionLimit: Float!
    dailyUsed: Float!
    monthlyUsed: Float!
  }

  type ScreeningResult {
    verdict: String!
    score: Int!
    flags: [String!]!
    provider: String
    screenedAt: String!
  }

  # ─── Webhook Types ────────────────────────────────────────────────────────────

  type WebhookDelivery {
    id: ID!
    destinationUrl: String!
    status: String!
    attemptCount: Int!
    maxAttempts: Int!
    createdAt: String!
    updatedAt: String!
    nextAttemptAt: String
  }

  type DLQEntry {
    id: ID!
    deliveryId: String!
    destinationUrl: String!
    finalError: String!
    addedAt: String!
    expiresAt: String!
  }

  type WebhookStats {
    pending: Int!
    delivered: Int!
    failed: Int!
    dlqCount: Int!
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    # Transaction queries
    transaction(id: ID!): Transaction
    transactions(limit: Int, offset: Int, status: String, currency: String): [Transaction!]!

    # Quote query
    quote(amount: String!, currency: String!, feeMethod: String, sourceAddress: String): Quote

    # Currency queries
    currencies: [Currency!]!
    institutions(currency: String!): [Institution!]!

    # Rate query
    rate(currency: String): RateInfo!

    # Dispute queries
    dispute(id: ID!): Dispute
    disputes(status: String, limit: Int): [Dispute!]!

    # Analytics queries
    analyticsSummary(from: String, to: String): AnalyticsSummary!

    # KYC queries
    kycInfo(userId: String!): KYCInfo
    userLimits(userId: String!): UserLimits

    # Compliance queries
    screeningResult(address: String!): ScreeningResult
    screeningOverrides: [ScreeningResult!]!

    # Webhook queries
    webhookDelivery(id: ID!): WebhookDelivery
    webhookDeliveries(status: String, limit: Int): [WebhookDelivery!]!
    webhookStats: WebhookStats!
    dlqEntries(limit: Int): [DLQEntry!]!
  }

  # ─── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    # Webhook mutations
    replayWebhook(dlqEntryId: ID!): WebhookDelivery!
    retryWebhookDelivery(deliveryId: ID!): WebhookDelivery!

    # Dispute mutations
    createDispute(transactionId: String!, reason: String!, evidence: [String!]): Dispute!
    resolveDispute(id: ID!, resolution: String!): Dispute!

    # Screening override mutations
    addScreeningOverride(address: String!, verdict: String!, reason: String!): Boolean!
    removeScreeningOverride(address: String!): Boolean!

    # KYC mutations
    submitKYC(userId: String!, documentType: String!, documentId: String!): KYCInfo!
    approveKYC(userId: String!): KYCInfo!
    rejectKYC(userId: String!, reason: String!): KYCInfo!
  }

  # ─── Subscriptions ────────────────────────────────────────────────────────────

  type Subscription {
    transactionStatusChanged(id: ID!): Transaction!
    rateUpdated(currency: String): RateInfo!
    transactionCreated: Transaction!
    disputeStatusChanged(id: ID!): Dispute!
    screeningAlert(address: String!): ScreeningResult!
  }
`;

export const schema = buildSchema(typeDefs);
