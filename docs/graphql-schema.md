# GraphQL Schema

The GraphQL endpoint is served at `POST /api/graphql`.

## Authentication

All queries require authentication. Pass credentials via:

- `Authorization: Bearer <token>` header, or
- `x-api-key: <key>` header

Admin-only queries/mutations require `x-role: admin` header.
Ops-only mutations require `x-role: ops` header.

## Queries

### Transactions

```graphql
query GetTransaction($id: ID!) {
  transaction(id: $id) {
    id
    status
    amount
    currency
    userAddress
    beneficiary {
      institution
      accountIdentifier
      accountName
      currency
    }
    stellarTxHash
    createdAt
  }
}

query ListTransactions($limit: Int, $offset: Int, $status: String, $currency: String) {
  transactions(limit: $limit, offset: $offset, status: $status, currency: $currency) {
    id
    status
    amount
    currency
    createdAt
  }
}
```

### Quotes

```graphql
query GetQuote($amount: String!, $currency: String!, $feeMethod: String) {
  quote(amount: $amount, currency: $currency, feeMethod: $feeMethod) {
    destinationAmount
    rate
    bridgeFee
    payoutFee
    estimatedTime
    validUntil
  }
}
```

### Currencies & Institutions

```graphql
query {
  currencies {
    code
    name
    symbol
    flag
    minAmount
    maxAmount
  }
  institutions(currency: "NGN") {
    id
    name
    code
    type
  }
}
```

### Disputes (admin)

```graphql
query {
  disputes(status: "open", limit: 20) {
    id
    transactionId
    reason
    status
    createdAt
  }
}
```

### Analytics (admin)

```graphql
query {
  analyticsSummary(from: "1700000000000", to: "1700086400000") {
    totalTransactions
    totalVolume
    completedTransactions
    failedTransactions
    topCurrencies {
      currency
      count
      volume
    }
  }
}
```

### KYC

```graphql
query {
  kycInfo(userId: "user_abc123") {
    status
    documentType
    submittedAt
    verifiedAt
  }
  userLimits(userId: "user_abc123") {
    tier
    dailyLimit
    monthlyLimit
    dailyUsed
    monthlyUsed
  }
}
```

### Compliance Screening

```graphql
query {
  screeningResult(address: "GA2KP7ZOUR3QX5GYKHXMYLTPLTJMYBJ4QFDHZFRQLPN4JKNN2YXX5ABC") {
    verdict
    score
    flags
    provider
    screenedAt
  }
}
```

## Mutations

### Create Dispute

```graphql
mutation {
  createDispute(transactionId: "tx_123", reason: "Incorrect amount", evidence: ["screenshot.png"]) {
    id
    status
    createdAt
  }
}
```

### Resolve Dispute (admin)

```graphql
mutation {
  resolveDispute(id: "dispute_abc", resolution: "Refund issued") {
    id
    status
    resolution
  }
}
```

### Screening Overrides (ops)

```graphql
mutation {
  addScreeningOverride(address: "GA...XYZ", verdict: "allow", reason: "Whitelisted partner") {
    # returns true
  }
  removeScreeningOverride(address: "GA...XYZ") {
    # returns true
  }
}
```

## Subscriptions

Subscriptions use a polling pattern (async generator). In production, replace with WebSocket and Redis pub/sub.

### Transaction Status Changed

```graphql
subscription {
  transactionStatusChanged(id: "tx_123") {
    id
    status
    updatedAt
  }
}
```

### Rate Updated

```graphql
subscription {
  rateUpdated(currency: "NGN") {
    rate
    currency
    updatedAt
  }
}
```

### New Transaction Created

```graphql
subscription {
  transactionCreated {
    id
    amount
    currency
    status
  }
}
```

### Dispute Status Changed

```graphql
subscription {
  disputeStatusChanged(id: "dispute_abc") {
    id
    status
    updatedAt
  }
}
```

## Error Format

Errors are aligned with the REST middleware format:

```json
{
  "errors": [
    {
      "error": "UNAUTHORIZED",
      "message": "Unauthorized: authentication required"
    }
  ]
}
```

| error code          | HTTP equivalent |
| ------------------- | --------------- |
| `UNAUTHORIZED`      | 401             |
| `FORBIDDEN`         | 403             |
| `VALIDATION_ERROR`  | 400             |
| `QUERY_TOO_DEEP`    | 400             |
| `QUERY_TOO_COMPLEX` | 400             |
| `SERVER_ERROR`      | 500             |

## Security

- **Depth limit**: Queries exceeding 7 levels of nesting are rejected.
- **Complexity limit**: Queries exceeding 500 nodes are rejected.
- **Auth guards**: All queries/mutations require authentication. Admin/ops mutations require role headers.
- **Error alignment**: Error responses follow the same `StandardErrorResponse` structure as REST endpoints.
