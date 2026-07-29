# Dependency Injection Guide

## Overview

The Stellar-Spend application uses a lightweight Dependency Injection (DI) container for managing service dependencies. This enables better testability, modularity, and loose coupling between components.

## Service Lifetimes

### Singleton

A single instance is created and reused throughout the application lifetime.

```typescript
container.registerSingleton<IQuoteService>(SERVICE_KEYS.QUOTE_SERVICE, () => new QuoteService());
```

### Transient

A new instance is created each time the service is resolved.

```typescript
container.registerTransient<IQuoteService>(SERVICE_KEYS.QUOTE_SERVICE, () => new QuoteService());
```

### Scoped

A single instance is created per scope (e.g., per request).

```typescript
container.registerScoped<IQuoteService>(SERVICE_KEYS.QUOTE_SERVICE, () => new QuoteService());
```

## Usage

### Resolving Services

**Asynchronously:**

```typescript
const quoteService = await getService<IQuoteService>(container, SERVICE_KEYS.QUOTE_SERVICE);
```

**Synchronously:**

```typescript
const quoteService = getServiceSync<IQuoteService>(container, SERVICE_KEYS.QUOTE_SERVICE);
```

### Scoped Resolution

```typescript
// Create a scope
container.createScope('request-123');

// Resolve within scope
const service = await getService<IQuoteService>(
  container,
  SERVICE_KEYS.QUOTE_SERVICE,
  'request-123',
);

// Dispose scope
container.disposeScope('request-123');
```

## Validation

Validate all registered services can be resolved:

```typescript
await validateServices(container);
```

## Best Practices

1. **Use interfaces** for service contracts
2. **Register at startup** in `configureServices()`
3. **Use appropriate lifetimes** based on service state
4. **Validate on startup** to catch configuration errors
5. **Create scopes** for request-scoped services
