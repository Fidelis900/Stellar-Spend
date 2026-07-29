# Adding a New Fiat Corridor

Adding a new corridor (currency + country) is now a **config + validation exercise** — no code changes required.

## Step-by-step

### 1. Add currency config in `src/lib/currencies.ts`

Add an entry to `SUPPORTED_CURRENCIES`:

```ts
{
  code: 'XXX',
  name: 'Currency Name',
  symbol: '¤',
  decimals: 2,
  minAmount: 10,
  maxAmount: 1_000_000,
  active: true,
  country: 'XX',    // ISO 3166-1 alpha-2
}
```

### 2. Add corridor config in `src/lib/corridor-config.ts`

Add an entry to `CORRIDOR_CONFIG`:

```ts
XXX: {
  currency: 'XXX',
  country: 'XX',
  displayName: 'Country — Name',
  active: true,
  validators: {
    fields: {
      account: { pattern: '^\\d{10}$', minLength: 10, maxLength: 10 },
      iban: { enabled: false },
    },
  },
  institutions: [
    { id: 'bank-id', name: 'Bank Name', code: 'BANKCODE', type: 'bank' },
  ],
  kycDefaults: {
    verificationTier: 'tier2',
  },
  providers: [
    { name: 'paycrest', supported: true },
  ],
}
```

### 3. Add flag emoji in `src/lib/currency-flags.ts`

```ts
XXX: '🇽🇽',
```

### 4. Validate the config

Run the validation helper to catch configuration errors:

```bash
curl -s http://localhost:3001/api/offramp/corridor-validate | jq
```

Or call in code:

```ts
import { validateCorridorConfig } from '@/lib/corridor-config';
const result = validateCorridorConfig('XXX');
console.log(result);
```

### 5. Verify provider support

Ensure the payout provider (e.g. Paycrest) lists this currency in their `/currencies` endpoint:

```bash
curl -s https://api.paycrest.io/v1/currencies -H "API-Key: $PAYCREST_API_KEY"
```

If the provider does not support the currency, set `supported: false` for that provider entry. The corridor validation will report it but the config remains valid for fallback behaviour.

### 6. Restart the dev server

```bash
npm run dev
```

---

## Config reference

| Field                            | Type    | Description                                          |
| -------------------------------- | ------- | ---------------------------------------------------- |
| `currency`                       | string  | ISO 4217 code (3 letters)                            |
| `country`                        | string  | ISO 3166-1 alpha-2                                   |
| `displayName`                    | string  | Human-readable label                                 |
| `active`                         | boolean | Whether the corridor is live                         |
| `validators.fields.account`      | object  | Account number rules (pattern, minLength, maxLength) |
| `validators.fields.routing`      | object  | Routing/IFSC code rules                              |
| `validators.fields.iban.enabled` | boolean | Whether IBAN is accepted                             |
| `institutions`                   | array   | Known institutions for the corridor                  |
| `kycDefaults.verificationTier`   | string  | Tier granted after KYC (tier1/tier2/tier3)           |
| `kycDefaults.tierOverrides`      | object  | Per-tier limit overrides                             |
| `providers`                      | array   | Payout provider support flags                        |

---

## Testing

After adding a corridor, verify:

1. **GET /api/offramp/currencies** — returns the new currency
2. **POST /api/offramp/quote** with the new currency — returns a valid quote (or appropriate error if provider does not support it)
3. **GET /api/offramp/institutions/{currency}** — returns configured institutions
4. **Bank validation** works for the new country's account format — run `npx vitest run bank-validation.test.ts`
