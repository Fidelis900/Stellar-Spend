# Transaction History Sync Feature

## Overview

This feature adds **authenticated server-side synchronization** of transaction history with **last-write-wins conflict resolution**. Users can opt-in to have their transaction metadata (notes, tags, favorites) synchronized across devices while maintaining full local-only offline functionality.

## Architecture

### Components

#### 1. **Client-Side Sync Management**

- **`src/lib/sync-storage.ts`** - LocalStorage-based sync state management

  - Settings: Sync toggle, strategy, last sync timestamp
  - Metadata: Per-transaction versioning and sync status
  - Queue: Pending transactions awaiting sync

- **`src/lib/transaction-sync-client.ts`** - Sync orchestration

  - Fetches server history
  - Merges local and server transactions
  - Uploads local changes
  - Updates sync metadata

- **`src/lib/transaction-merge.ts`** - Conflict resolution
  - Last-write-wins strategy based on timestamps
  - Metadata merging (notes, tags, favorites)
  - Audit trail for conflicts

#### 2. **Server-Side Sync Endpoints**

- **`src/app/api/v1/sync/history/route.ts`**

  - `GET /api/v1/sync/history?wallet={address}` - Fetch user's synced history
  - `POST /api/v1/sync/history` - Upload/merge transactions

- **`src/app/api/v1/sync/settings/route.ts`**
  - `GET /api/v1/sync/settings?wallet={address}` - Fetch sync settings
  - `POST /api/v1/sync/settings` - Update sync preferences

#### 3. **UI Components**

- **`src/app/settings/page.tsx`** - Settings page with new "Privacy & Sync" section

  - Sync toggle (opt-in)
  - Last sync timestamp
  - Sync status indicator
  - Privacy notice

- **`src/hooks/useSyncSettings.ts`** - React hook for sync settings management

#### 4. **Background Sync**

- **`src/lib/background-sync.ts`** - Extended with history sync

  - `triggerHistorySync()` - Manual/periodic sync trigger
  - Status tracking

- **`public/sw.js`** - Service Worker with sync event
  - `sync-transaction-history` tag for background sync

### Data Flow

```
User toggles sync in Settings
  ↓
POST /api/v1/sync/settings (enable/disable)
  ↓
SyncStorage.toggleSync() updates local state
  ↓
On transaction change → SyncStorage.addToQueue()
  ↓
Background sync triggered (periodic/manual)
  ↓
Fetch server history
  ↓
Merge using last-write-wins strategy
  ↓
Upload local-only/modified transactions
  ↓
Update sync metadata and clear queue
```

## Key Features

### 1. **Opt-In Privacy-Respecting Design**

- Sync disabled by default
- Users explicitly enable for each wallet
- Settings persisted server-side per wallet
- Users can disable at any time

### 2. **Last-Write-Wins Conflict Resolution**

```typescript
// Timestamps compared:
// 1. finalizedAt (if present)
// 2. timestamp (fallback)

// When timestamps differ: Winner = newer timestamp
// When timestamps equal: Merge metadata (prefer non-empty values)
```

### 3. **Metadata-Only Sync**

- Does NOT sync operational transaction data (amounts, addresses, hashes)
- Syncs only user-controlled metadata:
  - Notes (user annotations)
  - Tags (custom categories)
  - Favorites (bookmarked transactions)
- Operational data sourced from backend APIs (Stellar, Paycrest, Base)

### 4. **Offline-First with Graceful Degradation**

- Local storage continues to work without sync
- Sync failures don't prevent local operations
- Queue-based retry mechanism
- Background sync registers with Service Worker

### 5. **Audit Trail for Conflicts**

```typescript
interface ConflictRecord {
  transactionId: string;
  localVersion: Transaction;
  serverVersion: Transaction;
  winner: 'local' | 'server';
  resolvedAt: number;
  reason: string; // e.g., "Server version newer (server: 2000, local: 1000)"
}
```

## API Endpoints

### Sync History

**GET /api/v1/sync/history**

```
Query: wallet={address}
Returns: { success, transactions[], timestamp }
```

**POST /api/v1/sync/history**

```
Body: {
  wallet: string,
  transactions: Transaction[],
  timestamp: number
}
Returns: { success, synced, conflicts, conflictDetails }
```

### Sync Settings

**GET /api/v1/sync/settings**

```
Query: wallet={address}
Returns: {
  settings: {
    wallet: string,
    syncEnabled: boolean,
    conflictResolutionStrategy: 'last-write-wins',
    updatedAt: number
  }
}
```

**POST /api/v1/sync/settings**

```
Body: {
  wallet: string,
  syncEnabled: boolean
}
Returns: { settings, timestamp }
```

## Testing

### Unit Tests

**`src/lib/__tests__/transaction-merge.test.ts`**

- Merge with no conflicts
- Server newer (last-write-wins)
- Local newer (last-write-wins)
- Equal timestamps (metadata merge)
- Empty arrays
- Finding differences

**`src/lib/__tests__/sync-storage.test.ts`**

- Settings CRUD
- Metadata management
- Queue management
- Sync completion tracking
- Clear functionality

### Manual Testing

1. **Enable Sync**

   - Go to Settings → Privacy & Sync
   - Toggle sync ON
   - Verify "Sync enabled" message appears

2. **Add Transaction Metadata**

   - Add a note to a transaction
   - Mark transaction as favorite
   - Add tags

3. **Verify Local Sync**

   - Transaction metadata persists in localStorage
   - SyncStorage.getQueue() shows pending items

4. **Cross-Device Sync** (requires auth)

   - Login on device A with sync enabled
   - Add transaction metadata
   - Trigger manual sync: `useBackgroundSync().triggerHistorySync(address, txs)`
   - Login on device B
   - Verify metadata appears

5. **Conflict Resolution**
   - Modify same transaction on two devices
   - Latest modification timestamp wins
   - Check ConflictRecord in sync response

## Configuration

### Database Setup (Production)

Create table for sync settings:

```sql
CREATE TABLE sync_settings (
  id SERIAL PRIMARY KEY,
  wallet VARCHAR(255) UNIQUE NOT NULL,
  sync_enabled BOOLEAN NOT NULL DEFAULT false,
  conflict_resolution_strategy VARCHAR(50) NOT NULL DEFAULT 'last-write-wins',
  updated_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT wallet_format CHECK (wallet ~ '^0x[a-fA-F0-9]{40}$|^G[A-Z2-7]{55}$')
);

CREATE INDEX idx_sync_settings_wallet ON sync_settings(wallet);
```

### Environment Variables

No new environment variables required. Uses existing:

- `DATABASE_URL` - PostgreSQL connection
- Auth middleware for wallet verification

## Security Considerations

### Authentication

- All endpoints require wallet ownership verification
- Middleware should validate request origin matches wallet
- TODO: Implement proper auth checks in endpoints

### Data Privacy

- Sync settings stored server-side (encrypted at rest)
- Transaction metadata synced only between user devices
- No third-party access
- User can clear sync data anytime

### Conflict Handling

- No user data lost in conflicts
- Both versions retained for audit
- Last-write-wins is deterministic and predictable
- Timestamps ensure reproducible conflict resolution

## Future Enhancements

1. **Incremental Sync**

   - Delta sync instead of full history
   - Only sync changed transactions
   - Reduces bandwidth and latency

2. **Selective Sync**

   - Choose which transactions to sync
   - Exclude sensitive transactions
   - Per-transaction opt-out

3. **Sync Conflict UI**

   - Show conflicts to user
   - Let user manually resolve
   - Merge or pick version

4. **Analytics**

   - Track sync metrics
   - Monitor conflict rates
   - Optimize sync timing

5. **End-to-End Encryption**
   - Encrypt metadata before upload
   - Server stores encrypted blobs
   - Only client can decrypt

## Troubleshooting

### Sync Not Working

1. Check sync is enabled: `SyncStorage.getSettings().syncEnabled`
2. Verify queue has items: `SyncStorage.getQueue()`
3. Check browser network tab for API failures
4. Verify wallet address is correct

### Data Not Appearing on Second Device

1. Enable sync on both devices
2. Verify same wallet address
3. Wait for background sync (may take 5-10 seconds)
4. Manually trigger: Call `triggerHistorySync()`

### Conflicts Detected

1. This is expected when modifying same transaction on multiple devices
2. Last-write-wins strategy automatically resolves
3. No data is lost
4. Check `ConflictRecord` in sync response for details

## References

- ADR-001: LocalStorage Transaction History
- ADR-003: Adapter Pattern External Services
- ADR-006: Idempotency Implementation
