# Provider Fixture Refresh Guide

## Overview

Test fixtures in this directory represent recorded responses from external providers (Paycrest, Allbridge). They are used by contract tests to verify adapter parsing without live network access.

## How to Refresh Fixtures

### Paycrest

1. Obtain a valid API key from Paycrest dashboard
2. Run the capture script:
   ```bash
   curl -H "API-Key: $PAYCREST_API_KEY" https://api.paycrest.io/v1/sender/currencies > src/test/fixtures/paycrest/currencies.json
   curl -H "API-Key: $PAYCREST_API_KEY" https://api.paycrest.io/v1/sender/institutions/NGN > src/test/fixtures/paycrest/institutions.json
   curl -H "API-Key: $PAYCREST_API_KEY" https://api.paycrest.io/v1/rates/USDC/100/NGN > src/test/fixtures/paycrest/rate.json
   ```
3. For order fixtures, create a real order via the API and save the response
4. Review and sanitise any PII before committing

### Allbridge

1. Ensure access to Allbridge SDK (mainnet or testnet)
2. The SDK does not expose raw HTTP endpoints, so fixtures are based on documented response shapes
3. To verify correctness, run:
   ```bash
   npx ts-node scripts/capture-allbridge-fixtures.ts
   ```
4. Update the JSON files manually if the SDK response shape changes

## Running Contract Tests

```bash
npm test -- --testPathPattern="contract"
```

These tests run offline and use only fixture data.
