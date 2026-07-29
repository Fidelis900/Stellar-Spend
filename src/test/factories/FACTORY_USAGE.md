# Test Factory Library

All test data for Stellar-Spend lives under `src/test/factories/`.  
Every factory is **typed**, **deterministic**, and **seedable**.

---

## Quick Start

```ts
import {
  seed,
  makeTransaction,
  completedTransaction,
  makeQuote,
  makeBeneficiary,
  makeUser,
} from '@/test/factories';

beforeEach(() => seed()); // deterministic sequence from seed=1

it('processes a completed transaction', () => {
  const tx = completedTransaction({ amount: '250.00' });
  // tx.id === 'tx_test_0001', tx.status === 'completed', ...
});
```

---

## Seeding

| Function       | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `seed(n = 1)`  | Reset all factories to seed `n`. Call in `beforeEach`.        |
| `seedWith(n)`  | Same but returns `n` for inline docs.                         |
| `createRng(n)` | Create an independent RNG instance for a single factory call. |

Using the **same seed** guarantees the **same IDs, addresses, and names** on every run
and on every CI machine.

---

## Transaction Factory

```ts
import {
  makeTransaction,
  makeTransactions,
  pendingTransaction,
  completedTransaction,
  failedTransaction,
  transactionWithBridge,
} from '@/test/factories';

// Defaults — pending, with test bank details
const tx = makeTransaction();

// Override any field
const bigTx = makeTransaction({ amount: '5000.00', currency: 'USDC' });

// Trait shortcuts
const done = completedTransaction(); // status=completed, bridgeStatus=completed, payoutStatus=settled
const bad = failedTransaction(); // status=failed, error=...
const mid = transactionWithBridge(); // bridge completed, no payout yet

// Batch
const ten = makeTransactions(10);
```

### Transaction fields

| Field                           | Default                             | Notes                                                     |
| ------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| `id`                            | `tx_test_0001`, `tx_test_0002`, …   | Monotonic counter, reset with `resetTransactionCounter()` |
| `timestamp`                     | `1700000001000`, `1700000002000`, … | Deterministic, monotonic                                  |
| `userAddress`                   | Seeded Stellar G-address            | 56 chars, valid format                                    |
| `amount`                        | `'100.00'`                          |                                                           |
| `currency`                      | `'USDC'`                            |                                                           |
| `beneficiary.institution`       | `'Test Bank'`                       |                                                           |
| `beneficiary.accountIdentifier` | `'0123456789'`                      |                                                           |
| `status`                        | `'pending'`                         |                                                           |

---

## Quote Factory

```ts
import { makeQuote, makeQuoteForCurrency, makeQuotes } from '@/test/factories';

const q = makeQuote();
// { destinationAmount: '159800.00', rate: 1598, currency: 'NGN', ... }

const kes = makeQuoteForCurrency('KES');
const many = makeQuotes(3, { currency: 'GHS' });
```

---

## Beneficiary Factory

```ts
import { makeBeneficiary, makeBeneficiaryForCurrency } from '@/test/factories';

const b = makeBeneficiary();
// { institution: 'ACCESS', accountIdentifier: '000000001', accountName: 'Alice Okoye', currency: 'NGN' }

const kes = makeBeneficiaryForCurrency('KES');
```

---

## User Factory

```ts
import { makeUser, makeUsers } from '@/test/factories';

const u = makeUser();
// { id: 'user_test_0001', address: 'G...', email: 'user1@test.example', createdAt: ... }

const users = makeUsers(5);
```

---

## Integration Test Seeding

```ts
// src/test/integration/my.integration.test.ts
import { seed, makeTransaction, makeBeneficiary } from '@/test/factories';

describe('payout flow', () => {
  beforeEach(() => seed(42)); // fixed seed for this suite

  it('creates an order for the transaction', async () => {
    const tx = makeTransaction({
      beneficiary: makeBeneficiary({ currency: 'NGN' }),
    });
    // ...
  });
});
```

---

## Adding a New Factory

1. Create `src/test/factories/<name>.factory.ts`
2. Export a `make<Name>()` function that accepts `overrides` and an optional `rng`
3. Export any counter reset function and add it to `seed.ts`
4. Re-export from `src/test/factories/index.ts`
