# Performance Optimization Findings

This document outlines the performance optimizations implemented in the Stellar Spend frontend.

## Key Optimizations

### 1. Component Memoization

- **Issue**: High-level components like `StellarSpendDashboard` were re-rendering their entire tree (Header, Table, Steps) on every keystroke in the amount field.
- **Solution**: Wrapped `Header`, `ProgressSteps`, and `RecentOfframpsTable` in `React.memo`. These components now only re-render if their props actually change.

### 2. Context Splitting

- **Issue**: `ToastContext` was providing both the `toasts` state and the `showToast`/`removeToast` actions in a single object. Components that only needed `showToast` were re-rendering every time any toast was added or removed.
- **Solution**: Split `ToastContext` into `ToastStateContext` and `ToastActionContext`. Components can now use `useToastActions()` to get stable action references without subscribing to state changes.

### 3. Stable Callbacks & Memoized Values

- **Issue**: Helper functions and derived data were being recreated on every render.
- **Solution**:
  - Used `useCallback` for all event handlers and polling logic in `StellarSpendDashboard` and `CurrencyConverter`.
  - Used `useMemo` for complex derived data like `balanceData` and `currencyOptions`.

### 4. Non-Critical State Updates

- **Issue**: Updating the transaction history list was competing with UI-critical updates like input fields.
- **Solution**: Used `useTransition` for updating the `transactions` state. This marks the state update as non-urgent, allowing the browser to prioritize input responsiveness.

## Results

- **Reduced Re-renders**: Keystrokes in the `FormCard` (amount input) no longer cause re-renders of the `Header`, `RecentOfframpsTable`, or `ProgressSteps`.
- **Improved Responsiveness**: The UI remains fluid even during background polling and history updates.
- **Stable References**: Sub-components receive stable function references, preventing unnecessary effect re-runs.
