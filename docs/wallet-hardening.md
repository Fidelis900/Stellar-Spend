# Wallet Flow Hardening

## Overview

This document describes the hardened wallet flow implementation for Stellar Spend, providing robust wallet detection, auto-reconnection, account change handling, and improved error states across Freighter and Lobstr wallets.

## Features

### 1. Wallet Detection

The system automatically detects installed wallets (Freighter, Lobstr) or gracefully handles when none are available.

**Implementation:**

- `WalletManager.getAvailableWallets()` - Returns list of detected wallets
- `WalletManager.isWalletAvailable(type)` - Checks if specific wallet is available
- `useStellarWallet.detectWallets()` - React hook to detect wallets

**Usage:**

```typescript
const { detectedWallets, connect } = useStellarWallet();

if (detectedWallets.includes('freighter')) {
  await connect('freighter');
}
```

### 2. Auto-Reconnect on Page Reload

When a user returns to the app after closing the browser, the wallet connection is automatically restored using localStorage persistence.

**Implementation:**

- Stores last-used wallet in `localStorage.stellar.lastWallet`
- On app load, automatically reconnects if `autoReconnect` setting is enabled
- Non-blocking: failure to reconnect doesn't show error to user
- Graceful fallback if wallet is no longer available

**Configuration:**

```typescript
const { settings, saveSettings } = useStellarWallet();

// Enable/disable auto-reconnect
saveSettings({
  autoReconnect: true,
  rememberLastWallet: true,
});
```

### 3. Account Change Detection

The system monitors when users change accounts in their wallet and prompts reconnection.

**Implementation:**

- Listens to `publicKeyChange` (Freighter) and `accountChange` (Lobstr) events
- Sets `accountChanged` flag and error state
- Provides actionable error message to user
- Clears flag when user acknowledges or reconnects

**Usage:**

```typescript
const { accountChanged, error } = useStellarWallet();

if (accountChanged) {
  // Show reconnect prompt
}
```

### 4. Improved Error States

Comprehensive error classification with actionable user-facing messages for common scenarios.

**Error Codes:**

- `WALLET_NOT_AVAILABLE` - Wallet extension not installed
- `WALLET_CONNECTION_ERROR` - Connection failed (declined, locked, wrong network)
- `WALLET_SIGNING_ERROR` - Transaction signing failed
- `ACCOUNT_CHANGED` - User changed account in wallet

**Error Classification:**

- Locked wallet → "Wallet is locked. Please unlock it."
- User declined → "Connection rejected. Please approve the request in your wallet."
- Wrong network → "Wrong network. Please switch to the correct network."
- Not installed → "Wallet extension not found. Please install it."

**Usage:**

```typescript
const { error, errorMessage } = useStellarWallet();

return (
  <WalletErrorDisplay
    error={error}
    onDismiss={handleDismissError}
  />
);
```

### 5. Switch Wallet Without Full Disconnect

Users can switch between wallets without a full reconnection flow.

**Implementation:**

- `useStellarWallet.switchWallet(newWalletType)` - Switch without full flow
- Disconnects from current wallet
- Connects to new wallet
- Updates localStorage with new preference if enabled
- Maintains account change listeners

**Usage:**

```typescript
const { switchWallet, walletType } = useStellarWallet();

<button onClick={() => switchWallet('lobstr')}>
  Switch to Lobstr
</button>
```

### 6. Last-Used Wallet Persistence

Remembers which wallet the user prefers and prioritizes it for auto-reconnect.

**Implementation:**

- Stored in `localStorage.stellar.lastWallet`
- Optional: controlled via `rememberLastWallet` setting
- Validated before reconnection (ensures wallet is still available)
- Cleared on explicit disconnect

**Storage:**

```typescript
// Saved automatically on successful connection
localStorage.setItem('stellar.lastWallet', 'freighter');
localStorage.setItem(
  'stellar.walletSettings',
  JSON.stringify({
    autoReconnect: true,
    rememberLastWallet: true,
  }),
);
```

## Architecture

### Core Files

**Wallet Adapters:**

- `src/lib/wallets/adapter.ts` - Base interface and error classes
- `src/lib/wallets/freighter.adapter.ts` - Freighter implementation
- `src/lib/wallets/lobstr.adapter.ts` - Lobstr implementation

**Manager:**

- `src/lib/wallets/manager.ts` - Orchestrates wallet operations and events

**React Hooks:**

- `src/hooks/useStellarWallet.ts` - Main hook with all features
- `src/hooks/useWalletFlow.ts` - UI state machine (unchanged)

**Components:**

- `src/components/WalletModal.tsx` - Wallet selection modal (existing)
- `src/components/WalletErrorDisplay.tsx` - Error display with suggestions (new)

**Tests:**

- `src/lib/wallets/__tests__/manager.test.ts` - Manager tests
- `src/lib/wallets/__tests__/wallet-integration.test.ts` - Integration tests
- `src/hooks/__tests__/useStellarWallet.test.tsx` - Hook tests

### State Flow

```
App Mount
  ↓
Load Settings from localStorage
  ↓
Detect Available Wallets
  ↓
Load Last-Used Wallet
  ↓
Auto-Reconnect (if enabled)
  ↓
Setup Account Change Listeners
  ↓
User Connected & Ready
```

### Event System

The `WalletManager` provides event listeners for reactive updates:

```typescript
manager.on('accountChange', (event) => {
  // User changed account in wallet
  console.log(event.walletType); // 'freighter' | 'lobstr'
});

manager.on('disconnect', (event) => {
  // Wallet disconnected
});

manager.on('networkChange', (event) => {
  // Network changed in wallet
});
```

## Integration Examples

### Basic Connection Flow

```typescript
'use client';

import { WalletModal } from '@/components/WalletModal';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import { WalletErrorDisplay } from '@/components/WalletErrorDisplay';

export function WalletConnect() {
  const {
    isConnected,
    publicKey,
    isConnecting,
    error,
    connect,
    disconnect,
    clearError,
  } = useStellarWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isConnected && publicKey) {
    return (
      <div>
        <p>Connected: {publicKey.slice(0, 6)}...</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setIsModalOpen(true)}>
        Connect Wallet
      </button>

      <WalletModal
        isOpen={isModalOpen}
        isConnecting={isConnecting}
        connectingWallet={null}
        error={error?.message || null}
        onConnect={async (walletType) => {
          try {
            await connect(walletType);
            setIsModalOpen(false);
          } catch (err) {
            // Error handled by useStellarWallet
          }
        }}
        onClose={() => setIsModalOpen(false)}
      />

      <WalletErrorDisplay
        error={error}
        onDismiss={clearError}
        actionLabel="Retry"
        onAction={() => setIsModalOpen(true)}
      />
    </>
  );
}
```

### Account Change Handling

```typescript
export function WalletAccountMonitor() {
  const { accountChanged, error, clearAccountChanged, connect, walletType } = useStellarWallet();

  useEffect(() => {
    if (accountChanged && walletType) {
      // Automatically reconnect to new account
      connect(walletType).then(() => {
        clearAccountChanged();
      });
    }
  }, [accountChanged, walletType, connect, clearAccountChanged]);

  return null;
}
```

### Wallet Switcher

```typescript
export function WalletSwitcher() {
  const {
    detectedWallets,
    walletType,
    isSwitching,
    switchWallet,
  } = useStellarWallet();

  return (
    <div>
      {detectedWallets.map((wallet) => (
        <button
          key={wallet}
          disabled={isSwitching || walletType === wallet}
          onClick={() => switchWallet(wallet)}
        >
          {wallet === walletType ? '✓ ' : ''}{wallet}
        </button>
      ))}
    </div>
  );
}
```

## Error Handling Strategies

### Connection Errors

**User Declined:**

- Message: "Connection rejected. Please approve the request in your wallet."
- Action: Retry connection

**Wallet Locked:**

- Message: "Wallet is locked. Please unlock it."
- Action: User unlocks wallet, then retry

**Wrong Network:**

- Message: "Wrong network. Please switch to the correct network."
- Action: User switches network in wallet, then retry

**Not Installed:**

- Message: "Wallet extension not found. Please install it."
- Action: Provide install links (already in WalletModal)

### Signing Errors

**Transaction Rejected:**

- Message: "Transaction rejected. Please approve it in your wallet."
- Action: Retry signing

**Wallet Locked:**

- Message: "Wallet is locked. Please unlock it."
- Action: User unlocks wallet, then retry

## Testing

### Unit Tests

- `manager.test.ts` - WalletManager functionality
- `useStellarWallet.test.tsx` - React hook behavior
- Tests cover initialization, connection, errors, cleanup

### Integration Tests

- `wallet-integration.test.ts` - End-to-end scenarios
- Tests cover reconnection, concurrent ops, edge cases

### Run Tests

```bash
npm run test -- src/lib/wallets
npm run test -- src/hooks/useStellarWallet
```

## Edge Cases Handled

1. **No Wallets Installed**

   - Graceful error message with install links
   - Prevents app from crashing

2. **User Switches Wallets Mid-Session**

   - Account change event triggers reconnection
   - Seamless transition to new account

3. **Wallet Locked During Operation**

   - Clear error state for unlock action
   - Retry mechanism available

4. **Network Mismatch**

   - Detects testnet vs mainnet
   - Provides network switch guidance

5. **Browser Storage Unavailable**

   - Graceful fallback to session-only mode
   - App continues to function

6. **Multiple Browser Tabs**

   - Each tab maintains independent state
   - localStorage acts as single source of truth

7. **Rapid Connection/Disconnection**
   - Queues operations properly
   - Prevents race conditions

## Browser Compatibility

- Modern browsers with localStorage support
- Chrome, Firefox, Safari, Edge (all recent versions)
- Freighter: Chrome/Edge extension
- Lobstr: Chrome extension or web app

## Performance Considerations

- Lazy listener setup (only when connected)
- Cleanup on disconnect/unmount
- Event listeners don't block main thread
- localStorage operations are synchronous but fast
- Minimal re-renders via React state management

## Security Considerations

- No private keys stored locally
- Only public key and wallet preference stored
- Event listeners are cleaned up properly
- Error messages don't leak sensitive data
- HTTPS enforced in production

## Migration Guide

### From Old Flow

**Before:**

```typescript
const { connect } = useWalletFlow();
await walletManager.connect('freighter');
```

**After:**

```typescript
const { connect } = useStellarWallet();
await connect('freighter');
// Includes auto-reconnect, account change detection, etc.
```

### Updating Components

Add error display component:

```typescript
import { WalletErrorDisplay } from '@/components/WalletErrorDisplay';

const { error, clearError } = useStellarWallet();

<WalletErrorDisplay error={error} onDismiss={clearError} />
```

## Future Enhancements

- Multiple account support per wallet
- Hardware wallet integration
- Mobile wallet deeplinks
- Transaction history persistence
- Custom RPC endpoint support
- Wallet provider plugins

## Troubleshooting

### "Wallet not available" error

- Check wallet is installed and enabled
- Try refreshing the page
- Restart browser to clear wallet state

### Account change not detected

- Wallet events may differ between providers
- Manual reconnection always works
- File issue if consistent problem

### Auto-reconnect not working

- Check `autoReconnect` setting is true
- Check localStorage is available
- Manual connection always works

### Switch wallet hangs

- May indicate wallet provider issue
- Try manual disconnect then connect
- Timeout implemented to prevent indefinite hang

## Contributing

To add support for new wallets:

1. Create new adapter in `src/lib/wallets/newwallet.adapter.ts`
2. Implement `WalletAdapter` interface
3. Register in `WalletManager.constructor()`
4. Add tests
5. Update documentation

## References

- [Stellar Documentation](https://developers.stellar.org/)
- [Freighter Wallet](https://www.freighter.app/)
- [Lobstr Wallet](https://lobstr.co/)
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
