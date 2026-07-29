# Configuration Management

## Overview

The configuration system provides centralized, type-safe configuration management with support for environment-specific settings, hot-reloading, and versioning.

## Usage

### Getting Configuration

```typescript
import { getConfig, getConfigSection } from '@/lib/config';

// Get entire configuration
const config = getConfig();

// Get specific section
const apiConfig = getConfigSection('api');
const feeConfig = getConfigSection('fees');
```

### Using ConfigManager

```typescript
import { getConfigManager } from '@/lib/config';

const manager = getConfigManager();

// Get current config
const config = manager.getConfig();

// Update configuration
manager.updateConfig({
  api: {
    timeoutMs: 60000,
  },
});

// Update specific section
manager.updateSection('api', {
  retryAttempts: 5,
});

// Watch for changes
const unwatch = manager.watch((config) => {
  console.log('Config updated:', config);
});

// Get version history
const history = manager.getHistory(10);

// Rollback to previous version
manager.rollback(1);

// Reset to environment defaults
manager.reset();
```

## Configuration Sections

### API Configuration

- `maxDuration`: Maximum request duration in seconds
- `timeoutMs`: Request timeout in milliseconds
- `retryAttempts`: Number of retry attempts
- `retryDelayMs`: Initial retry delay in milliseconds

### Fee Configuration

- `stablecoinFee`: Fee for stablecoin transactions
- `bridgeFeePercentage`: Bridge fee percentage
- `payoutFeePercentage`: Payout fee percentage

### Stellar Configuration

- `mainnetPassphrase`: Stellar mainnet passphrase
- `minXlmBalance`: Minimum XLM balance required
- `reserveAmount`: Reserve amount for transactions

### Bridge Configuration

- `pollingIntervalMs`: Polling interval in milliseconds
- `maxPollingAttempts`: Maximum polling attempts
- `timeoutMs`: Bridge operation timeout

### Payout Configuration

- `pollingIntervalMs`: Polling interval in milliseconds
- `maxPollingAttempts`: Maximum polling attempts
- `timeoutMs`: Payout operation timeout

### Transaction Configuration

- `estimatedTimeSeconds`: Estimated transaction time
- `confirmationBlocks`: Required confirmation blocks

### Rate Limit Configuration

- `requestsPerMinute`: Requests allowed per minute
- `requestsPerHour`: Requests allowed per hour

### Cache Configuration

- `currencyTtlMs`: Currency cache TTL
- `rateTtlMs`: Rate cache TTL
- `institutionTtlMs`: Institution cache TTL

### Validation Configuration

- `minAmount`: Minimum transaction amount
- `maxAmount`: Maximum transaction amount
- `amountDecimals`: Decimal places for amounts

## Environment-Specific Configs

Configurations are automatically selected based on `NODE_ENV`:

- **development**: Full logging, longer timeouts, lower rate limits
- **staging**: Balanced settings for testing
- **production**: Optimized for performance, higher rate limits, longer cache TTLs

## Validation

All configurations are validated using Zod schemas:

```typescript
import { validateConfig } from '@/lib/config';

const config = validateConfig(rawConfig);
```

## Versioning

Configuration changes are automatically versioned:

```typescript
const manager = getConfigManager();

// Get current version
const version = manager.getVersion();

// Set new version
manager.setVersion('1.1.0');

// Get version history
const history = manager.getHistory();
```

## Hot-Reloading

Watch for configuration changes:

```typescript
const manager = getConfigManager();

const unwatch = manager.watch((config) => {
  // React to configuration changes
  console.log('New config:', config);
});

// Stop watching
unwatch();
```

## Backward Compatibility

The legacy `CONFIG` constant is still available for backward compatibility:

```typescript
import { CONFIG } from '@/lib/config';

console.log(CONFIG.API.TIMEOUT_MS);
```
