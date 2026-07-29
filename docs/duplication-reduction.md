# Code Duplication Reduction Guide

## Overview

This guide documents patterns and utilities created to eliminate code duplication across the Stellar-Spend codebase.

## Shared Utilities

### API Utilities (`src/lib/api-utils.ts`)

Centralized API request handling:

```typescript
import { apiGet, apiPost, apiDelete } from '@/lib/api-utils';

// GET request
const data = await apiGet<QuoteResponse>('/api/offramp/quote');

// POST request
const result = await apiPost<OrderResponse>('/api/offramp/order', {
  amount: '100',
  currency: 'NGN',
});

// DELETE request
await apiDelete('/api/offramp/order/123');
```

### Common Utilities (`src/lib/common-utils.ts`)

Reusable utility functions:

```typescript
import {
  retryWithBackoff,
  debounce,
  throttle,
  memoize,
  deepMerge,
  safeJsonParse,
  formatCurrency,
  delay,
  isEmpty,
} from '@/lib/common-utils';

// Retry with exponential backoff
const result = await retryWithBackoff(() => fetchData(), {
  maxAttempts: 3,
  initialDelay: 1000,
});

// Debounce search input
const handleSearch = debounce((query: string) => {
  searchUsers(query);
}, 300);

// Format currency
const formatted = formatCurrency(1000, 'NGN'); // ₦1,000.00
```

## Shared Hooks

### Generic Polling Hook (`src/hooks/useGenericPolling.ts`)

Replaces duplicated polling logic:

```typescript
import { useGenericPolling } from '@/hooks/useGenericPolling';
import { BRIDGE_CONFIG } from '@/lib/polling/backoff';

const { pollStatus } = useGenericPolling({
  config: BRIDGE_CONFIG,
  terminalStates: ['completed', 'failed'],
  onTerminalState: (state) => {
    if (state === 'completed') {
      console.log('Success!');
    }
  },
  updateStorage: (status) => {
    TransactionStorage.update(txId, { status });
  },
});

await pollStatus('/api/status/123', { id: '123' }, (data) => data.status);
```

## Higher-Order Components (HOCs)

### Form Validation HOC (`src/components/hoc/withFormValidation.tsx`)

```typescript
import { withFormValidation, useFormValidation } from '@/components/hoc';

// Using HOC
const ValidatedForm = withFormValidation(MyForm, (data) => {
  return ValidationService.validateOfframpRequest(data).errors || [];
});

// Using hook
function MyForm() {
  const { errors, validate, clearErrors } = useFormValidation((data) => {
    return ValidationService.validateOfframpRequest(data).errors || [];
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validate(formData)) {
          submitForm();
        }
      }}
    >
      {/* form fields */}
    </form>
  );
}
```

### Loading State HOC (`src/components/hoc/withLoading.tsx`)

```typescript
import { withLoading, useLoading } from '@/components/hoc';

// Using hook
function MyComponent() {
  const { isLoading, withLoading } = useLoading();

  const handleSubmit = async () => {
    await withLoading(async () => {
      await submitForm();
    });
  };

  return <button disabled={isLoading}>{isLoading ? 'Loading...' : 'Submit'}</button>;
}
```

### Error Handling HOC (`src/components/hoc/withErrorHandling.tsx`)

```typescript
import { useErrorHandling } from '@/components/hoc';

function MyComponent() {
  const { error, clearError, withErrorHandling } = useErrorHandling();

  const handleAction = async () => {
    await withErrorHandling(async () => {
      await performAction();
    });
  };

  return (
    <>
      {error && <ErrorAlert error={error} onDismiss={clearError} />}
      <button onClick={handleAction}>Perform Action</button>
    </>
  );
}
```

## Patterns Eliminated

### 1. Polling Logic Duplication

**Before**: `usePollBridgeStatus` and `usePollPayoutStatus` had 80% identical code
**After**: Single `useGenericPolling` hook with configuration

### 2. Form Validation Duplication

**Before**: Each form component had its own validation state management
**After**: Shared `useFormValidation` hook and `withFormValidation` HOC

### 3. API Request Duplication

**Before**: Each component/service had its own fetch wrapper
**After**: Centralized `apiGet`, `apiPost`, `apiDelete` utilities

### 4. Loading State Duplication

**Before**: Each component managed its own loading state
**After**: Shared `useLoading` hook

### 5. Error Handling Duplication

**Before**: Try-catch blocks scattered throughout
**After**: Shared `useErrorHandling` hook

## Best Practices

1. **Extract common patterns** into utilities or hooks
2. **Use HOCs** for cross-cutting concerns
3. **Create barrel exports** for easy imports
4. **Document shared utilities** with examples
5. **Test shared code** thoroughly
6. **Keep utilities focused** on single responsibility
7. **Use TypeScript** for type safety

## Refactoring Checklist

- [ ] Identify duplicated code patterns
- [ ] Extract to utility or hook
- [ ] Create tests for shared code
- [ ] Update imports in consuming code
- [ ] Remove original duplicated code
- [ ] Verify functionality
- [ ] Update documentation
